'use strict';

var inherits = require('util').inherits;
var Service, Characteristic;
var mqtt = require("mqtt");

function mqttColorlightAccessory(log, config) {
    this.log = log;
    this.name = config["name"];
    this.url = config["url"];
    this.client_Id = 'mqttjs_' + Math.random().toString(16).substr(2, 8);
    this.options = {
        keepalive: 10,
        clientId: this.client_Id,
        protocolId: 'MQTT',
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 1000,
        connectTimeout: 30 * 1000,
        will: {
            topic: 'WillMsg',
            payload: 'Connection Closed abnormally..!',
            qos: 0,
            retain: false
        },
        username: config["username"],
        password: config["password"],
        rejectUnauthorized: false
    };

    this.caption = config["caption"];
    this.topics = config["topics"];

    this.switchStatus = false;

    this.cache = {};
    this.cache.hue = 0;
    this.cache.saturation = 0;
    this.cache.brightness = 50;


    this.options_publish = {
        qos: 0,
        retain: true
    };

    this.service = new Service.Lightbulb(this.name);

    this.service.getCharacteristic(Characteristic.On)
        .on('get', this.getStatus.bind(this))
        .on('set', this.setStatus.bind(this));

    this.service.addCharacteristic(new Characteristic.Brightness())
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));

    this.service.addCharacteristic(new Characteristic.Saturation())
        .on('get', this.getSaturation.bind(this))
        .on('set', this.setSaturation.bind(this));

    this.service.addCharacteristic(new Characteristic.Hue())
        .on('get', this.getHue.bind(this))
        .on('set', this.setHue.bind(this));



    // connect to MQTT broker
    this.client = mqtt.connect(this.url, this.options);

    this.client.on('error', (err) => {
        this.log('Error event on MQTT:', err);
    });

    this.client.on('message', (topic, message) => {
        switch (topic) {
            case `${this.topics.get}power`:
                this.switchStatus = (message.toString() === "true");
                this.log('POWER STATUS: ' + this.switchStatus ? 'ON' : 'OFF');
                this.service.getCharacteristic(Characteristic.On).setValue(this.switchStatus);
                break;

            case `${this.topics.get}set`:
                var parts = message.toString().split(",");
                if (parts.length > 0) {
                    this.log('COLOR IN MQTT: ' + parts[0]);
                    this.log('COLOR in Kelvin:' + this.color);
                    //this.color = parts[0];
                }

                //this.service.getCharacteristic(ColorCharacteristic).setValue(this.color, undefined, 'fromSetValue');
                break;
        }
    });

    this.client.subscribe(this.topics.get + '#');
}

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-mqtt-colorlight", "mqtt-colorlight", mqttColorlightAccessory);
}





mqttColorlightAccessory.prototype.getStatus = function(callback) {
    this.log(`getStatus - Asking for switch state ${this.switchStatus}`);
    callback(null, this.switchStatus);
}

mqttColorlightAccessory.prototype.setStatus = function(status, callback, context) {
    if (context !== 'fromSetValue') {
        if (this.switchStatus != status) {
            this.switchStatus = status;
            this.client.publish(`${this.topics.set}power`, String(this.switchStatus), this.publish_options);
        }
    }
    callback();
}


mqttColorlightAccessory.prototype.getBrightness = function(callback) {
    this.log(`getBrightness - Asking for lamp brightness ${this.cache.brightness}`);
    callback(null, this.cache.brightness);
}


mqttColorlightAccessory.prototype.setBrightness = function(brightness, callback, context) {
    if (context !== 'fromSetValue') {
        if (this.cache.brightness != brightness) {
            this.cache.brightness = brightness;
            this.log('NEW brightness: ' + this.cache.brightness);
            return this._setRGB(callback);
        }
    }
    callback();
}

mqttColorlightAccessory.prototype.getSaturation = function(callback) {
    this.log(`getSaturation - Asking for lamp saturation ${this.cache.saturation}`);
    callback(null, this.cache.saturation);
}

mqttColorlightAccessory.prototype.setSaturation = function(saturation, callback, context) {
    if (context !== 'fromSetValue') {
        if (this.cache.saturation != saturation) {
            this.cache.saturation = saturation;
            this.log('NEW saturation: ' + this.cache.saturation);
            return this._setRGB(callback);
        }
    }
    callback();
}

mqttColorlightAccessory.prototype.getHue = function(callback) {
    this.log(`getColor - Asking for lamp color ${this.cache.hue}`);
    callback(null, this.cache.hue);
}


mqttColorlightAccessory.prototype.setHue = function(hue, callback, context) {
    if (context !== 'fromSetValue') {
        if (this.cache.hue != hue) {
            this.cache.hue = hue;
            this.log('NEW HUE: ' + this.cache.hue);
            return this._setRGB(callback);
        }
    }
    callback();
}


mqttColorlightAccessory.prototype.getServices = function() {
    return [this.service];
}




/**
 * Sets the RGB value of the device based on the cached HSB values.
 *
 * @param {function} callback The callback that handles the response.
 */
mqttColorlightAccessory.prototype._setRGB = function(callback) {
    var rgb = this._hsvToRgb(this.cache.hue, this.cache.saturation, this.cache.brightness);
    var r = this._decToHex(rgb.r);
    var g = this._decToHex(rgb.g);
    var b = this._decToHex(rgb.b);

    var colorString = `#${r}${g}${b},1000,1000`;

    this.log(`New Color: ${colorString}`);

    this.client.publish(`${this.topics.set}set`, colorString, this.publish_options);
    callback();
}


/**
 * Converts an HSV color value to RGB. Conversion formula
 * adapted from http://stackoverflow.com/a/17243070/2061684
 * Assumes h in [0..360], and s and l in [0..100] and
 * returns r, g, and b in [0..255].
 *
 * @param   {Number}  h       The hue
 * @param   {Number}  s       The saturation
 * @param   {Number}  l       The lightness
 * @return  {Array}           The RGB representation
 */
mqttColorlightAccessory.prototype._hsvToRgb = function(h, s, v) {
    var r, g, b, i, f, p, q, t;

    h /= 360;
    s /= 100;
    v /= 100;

    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0:
            r = v;
            g = t;
            b = p;
            break;
        case 1:
            r = q;
            g = v;
            b = p;
            break;
        case 2:
            r = p;
            g = v;
            b = t;
            break;
        case 3:
            r = p;
            g = q;
            b = v;
            break;
        case 4:
            r = t;
            g = p;
            b = v;
            break;
        case 5:
            r = v;
            g = p;
            b = q;
            break;
    }
    var rgb = { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    return rgb;
}

/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are in [0..255] and
 * returns h in [0..360], and s and l in [0..100].
 *
 * @param   {Number}  r       The red color value
 * @param   {Number}  g       The green color value
 * @param   {Number}  b       The blue color value
 * @return  {Array}           The HSL representation
 */
mqttColorlightAccessory.prototype._rgbToHsl = function(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if (max == min) {
        h = s = 0; // achromatic
    } else {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }

    h *= 360; // return degrees [0..360]
    s *= 100; // return percent [0..100]
    l *= 100; // return percent [0..100]
    return [parseInt(h), parseInt(s), parseInt(l)];
}

/**
 * Converts a decimal number into a hexidecimal string, with optional
 * padding (default 2 characters).
 *
 * @param   {Number} d        Decimal number
 * @param   {String} padding  Padding for the string
 * @return  {String}          '0' padded hexidecimal number
 */
mqttColorlightAccessory.prototype._decToHex = function(d, padding) {
    var hex = Number(d).toString(16).toUpperCase();
    padding = typeof(padding) === 'undefined' || padding === null ? padding = 2 : padding;

    while (hex.length < padding) {
        hex = '0' + hex;
    }

    return hex;
}
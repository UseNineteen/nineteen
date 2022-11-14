'use strict';
var _ = require('underscore');
var moment = require('moment');
moment.parseFormat = require('moment-parseformat');
var Backbone = require('backbone');
module.exports = Backbone.Model.extend({
  initialize: function(attributes) {
    if (this.has('raw')) {
      this.set('parsed', this.parse(attributes.raw));
    }
  },

  parse: function(attrs) {
    let self = this;
    return _.mapObject(attrs, function(value, key) {
      // First, try to parse as a date/time
      let format = moment.parseFormat(value, {preferredOrder: 'MDY'});
      let time = moment(value, format);
      if (!self.validate({ time: time, format: format })) return +time;

      // Try to parse as Number
      if (!self.validate({ num: value })) return parseFloat(value.replace(',',''));

      // Try to parse as Numbered String e.g. "1. Hockey"
      if (!self.validate({ numstr: value })) return parseFloat(value);

      // Fall back to string if no special formats were matched
      return value;
    });
  },

  getParsed: function(key) {
    let value = this.get('parsed')[key];
    if (typeof value === 'undefined') value = Infinity
    return value;
  },

  pick: function() {
    return _.pick.apply(this, [this.get('raw')].concat(arguments));
  },

  validate: function(attrs, options) {
    if (_.has(attrs, 'format')) {
      let valid = _.any([
        /^YYYY-MM-DD[\sT]HH:m{2}:s{2}(.S{1,4})?Z?$/,
        /^YYYY-MM-DD[\sT]HH:m{2}(:s{2})?Z?$/,
        /^YYYY-MM-DD$/,
        /^M{1,2}\/D{1,2}\/Y{2,4}\s[Hh]{1,2}:m{2}\s?[Aa]?([AaPp]\.[Mm]\.)?$/,
        /^M{1,2}\/D{1,2}\/Y{2,4}$/,
        /^[hH]{1,2}:m{2}\s?[Aa]?([AaPp]\.[Mm]\.)?$/,
        /^d{2,4}$/,
        /^M{3,4}$/
      ], function(pattern) {
        return pattern.test(attrs.format);
      });

      if (!valid) return 'Invalid date/time.';
    }

    if (_.has(attrs, 'time')) {
      let message = 'Invalid date/time.';
      if (!moment.isMoment(attrs.time)) return message;
      if (!attrs.time.isValid()) return message;
    }

    if (_.has(attrs, 'num')) {
      let message = 'Invalid number.';
      let num = attrs.num.replace(',','');
      if (isNaN(num)) return message;
      if (isNaN(parseFloat(num))) return message;
    }

    if (_.has(attrs, 'numstr')) {
      let pattern = /^(\d+)[.:)]\s/;
      if (!pattern.test(attrs.numstr)) return 'Invalid numbered string.';
    }
  }
});

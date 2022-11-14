'use strict';
var moment = require('moment');
moment.parseFormat = require('moment-parseformat');
var DataItem = require( root.join('app/models/data_item') );
describe('DataItem Model', function() {
  describe('#parse', function() {
    var model;

    beforeEach(function() {
      model = new DataItem();
    });

    it('uses original string if no rules are matched', function() {
      var attrs = model.parse({ string: 'Basic string' });
      assert.equal(attrs.string, 'Basic string')
    });

    it('parses date strings', function() {
      var formats = [
        '2015-01-01T00:00:00.000Z',
        '2015-01-01 00:00:00.000Z',
        '2015-01-01T00:00:00.000',
        '2015-01-01 00:00:00.000',
        '2015-01-01T00:00:00Z',
        '2015-01-01 00:00:00Z',
        '2015-01-01T00:00:00',
        '2015-01-01 00:00:00',
        '2015-01-01T00:00Z',
        '2015-01-01 00:00Z',
        '2015-01-01T00:00',
        '2015-01-01 00:00',
        '2015-01-01',
        '01/01/2015 09:00 AM',
        '01/01/2015 09:00 am',
        '01/01/2015 09:00 A.M.',
        '01/01/2015 09:00 a.m.',
        '01/01/2015 9:00AM',
        '01/01/2015 9:00am',
        '01/01/2015 9:00A.M.',
        '01/01/2015 9:00a.m.',
        '01/01/2015',
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sun',
        'Mon',
        'Tue',
        'Wed',
        'Thu',
        'Fri',
        'Sat'
      ];

      formats.forEach(function(str) {
        let attrs = model.parse({ date: str });
        let format = moment.parseFormat(str, {preferredOrder: 'MDY'});
        assert.equal(attrs.date, +moment(str, format));
      });
    });

    it('parses time strings', function() {
      var formats = [
        '09:00 AM',
        '09:00 am',
        '09:00 a.m.',
        '9:00AM',
        '9:00am',
        '9:00a.m.',
        '01:00',
        '23:00'
      ];

      formats.forEach(function(str) {
        var attrs = model.parse({ time: str });
        let format = moment.parseFormat(str, {preferredOrder: 'MDY'});
        assert.equal(attrs.time, +moment(str, format));
      });
    });

    it('parses numbers', function() {
      assert.equal(model.parse({ num: '2,000' }).num, 2000);
      assert.equal(model.parse({ num: '2000' }).num, 2000);
      assert.equal(model.parse({ num: '2,000.05' }).num, 2000.05);
      assert.equal(model.parse({ num: '2000.5' }).num, 2000.5);
      // assert.equal(model.parse({ num: '2,5' }).num, 2.5);
    });

    it('parses numbered strings', function() {
      assert.equal(model.parse({ numstr: '1. Hockey' }).numstr, 1);
      assert.equal(model.parse({ numstr: '20. Foosball' }).numstr, 20);
    });
  });
});

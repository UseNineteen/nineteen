var _ = require('underscore');
var path = require('path');
var Backbone = require('backbone');
var Parsers = require('../collections/parsers');
var DataItems = require('../collections/data_items');

// populate Parsers collection with default parsers
// currently supporting xlsx, xls, and csv formats
function defaultParsers() {
  return new Parsers([{
    extname: 'xlsx',
    fn: require('../../lib/parsers/parser.xlsx.js')
  },{
    extname: 'xls',
    fn: require('../../lib/parsers/parser.xls.js')
  },{
    extname: 'csv',
    fn: require('../../lib/parsers/parser.csv.js')
  }]);
}

/**
 * The DataFile class parses binary files into JSON and saves them to sessionStorage
 * @see {@link http://backbonejs.org/#Model|Backbone.Model}
 */
var DataFile = Backbone.Model.extend({
  /**
   * Adds a parsers object to newly instatiated DataFile
   * @see {@link http://backbonejs.org/#Model-constructor|Backbone.Model.initialize}
   */
  initialize: function() {
    // attach parsers collection to model instance
    // this allows parsers to be added/removed on demand
    this.parsers = defaultParsers();
    this.collection = new DataItems();
  },

  /**
   * Reads binary string and converts to JSON format
   * @param  {string}   data     (required) binary string read from file
   * @param  {Function} callback function to run after string is parsed
   */
  read: function(data, callback) {
    // set model data to provided binary string
    this.set('data', data);

    // run model validation before proceeding
    if (this.isValid()) {
      var extname = this.extname(this.get('name'));
      var parser = this.parsers.findParser(extname);
      parser.get('fn')(data, function(err, data) {
        if (err) throw new Error(err);
        this.set('data', data);
        if (callback) callback(err, data);
      }.bind(this));
    } else {
      throw new Error(this.validationError);
    }
  },

  /**
   * Override Backbone.sync to interact with sessionStorage
   * @param  {[type]} method  [description]
   * @param  {[type]} model   [description]
   * @param  {[type]} options [description]
   * @return {[type]}         [description]
   */
  sync: function(method, model, options) {
    var json, string;
    model = model || this;
    switch (method) {
      case 'create':
      case 'update':
        json = model.toJSON();
        string = JSON.stringify(json);
        sessionStorage.setItem('datafile', string);
        break;
      case 'read':
        string = sessionStorage.getItem('datafile');
        json = JSON.parse(string);
        model.set(json);
        break;
      case 'delete':
        sessionStorage.removeItem('datafile');
        model.keys().forEach(function(key) {
          model.unset(key);
        });
        break;
    }
    this.trigger('sync', this);
  },

  fetch: function() {
    this.sync('read', this);
    return this;
  },

  /**
   * Runs validation on a DataFile's attributes
   * @see {@link http://backbonejs.org/#Model-validate|Backbone.Model.validate}
   */
  validate: function(attrs, options) {
    attrs = attrs || this.attributes;
    if (!attrs) return;
    if (!attrs.name) {
			return 'You must set a `name` attribute.';
		} else {
      var extname = this.extname(attrs.name);
      if (!extname) {
        return 'Your file needs a valid extension.';
      }

      var parser = this.parsers.findParser(extname);
      if (!parser) {
        return 'Unsupported file extension: '+ extname +'.';
      }
    }

    if (!attrs.data) {
      return 'You must pass a `data` parameter to #read.';
    }
  },

  /**
   * Gets extname from file
   * @param  {string} file path to file
   * @return {string}      parsed extension, without leading period
   * @see {@link https://nodejs.org/api/path.html|Path documentation}
   */
  extname: function(file) {
    return path.extname(file).slice(1);
  },

  /**
	 * Checks to see if the datafile has non-empty data array.
	 */
  hasData: function() {
    return this.get('data') instanceof Array && this.get('data').length > 0;
  },

  /**
	 * Checks to see if the datafile has already been parsed.
	 */
	isParsed: function() {
    if (!this.hasData()) return false;
		return this.collection.length === this.get('data').length;
	},

  columnCount: function() {
    return this.collection.columns.length;
  },

  rowCount: function() {
    return this.collection.length;
  },

  /**
   * Get file details as a human-readable string
   * @return {string} A string listing the columns and rows in the spreadsheet
   */
  details: function() {
    return `${this.columnCount()} columns, ${this.rowCount()} rows`
  }
});

module.exports = DataFile;

'use strict';

let $ = require('jquery');
let _ = require('underscore');
let d3 = require('d3');
let Backbone = require('backbone');
let Marionette = require('backbone.marionette');
let DataFile = require('../models/data_file');
let path = require('path');

module.exports = Marionette.LayoutView.extend({
  id: 'import',
  template: require('../templates/import.hbs'),

  templateHelpers: {
    github: require('../../package.json').repository.url,
    sample: '/shopping_decision_diary.xlsx',
    helpURL: require('../../package.json').helpURL
  },

  ui: {
    'fileProxy': '.choose-file',
    'file': 'input[type="file"]',
    'url': 'input[type="url"]',
    'sample': '#sample',
    'downloadForm': '#download',
    'uploadForm': '#upload'
  },

  triggers: {
    'submit @ui.downloadForm': 'downloadFile',
    'click @ui.fileProxy': 'chooseFile',
    'click @ui.sample': 'sampleFile',
    'change @ui.file': 'uploadFile'
  },

  initialize: function() {
    // Listen to the 'progress:restart' event,
    // instantiate a new ProgressView
    this.on('progress:restart', this.progressBar);
  },

  /*
   * Instantiates a new ProgressView instance.
   */
  progressBar: function() {
    var ProgressView = require('../views/progress');

    // Destroy any existing progress view
    if (this.progress) this.progress.destroy();

    // Instantiate a new progress view, passing in the data file model and
    // data items collection.
    let progress = this.progress = new ProgressView({
      collection: this.collection,
      model: this.model
    });

    // Append the progress view's HTML element to the main application region
    this.$el.after(this.progress.render().el);

    // Start parsing JSON data
    this.on('progress:start', function() {
      this.progress.trigger('start')
    });

    // When the progress view triggers the 'complete' event,
    // navigate to the visualization.
    this.listenTo(this.progress, 'complete', function() {
      Backbone.history.navigate('visualize', { trigger: true });
    });

    return this.progress;
  },

  /*
   * Downloads files from a remote server.
   *
   * Will attempt to make a local XHR request, but only if the user's browser
   * supports both the File API and XHR Response Type Blob.
   *
   * Otherwise, submits the form. The server will download the file and convert
   * it to JSON.
   *
   * CORS issues sometimes occur here where the remote server does not set the
   * Access-Control-Allow-Origin header. This only applies in-browser, however,
   * so the server-side download should work just fine.
   *
   * TODO:
   * - Offer to upload file if the resource does not have proper CORS headers
   * - Warn user when submitting to server
   */
  onDownloadFile: function() {
    // Resets the progress view to its default state
    this.trigger('progress:restart')

    // Determine whether to download + process the file client- or server-side
    if (this.canDownloadLocal() && this.canReadLocal()) {
      // Process the file securely in browser
      this.downloadLocal();
    } else {
      // TODO: Warn here about call to server
      this.downloadRemote();
    }
  },

  /*
   * Proxy for file input. Opens file browser.
   */
  onChooseFile: function() {
    this.ui.file.trigger('click');
  },

  /*
   * Loads files from local machine.
   *
   * Will attempt to do this client-side, but only if the user's browser
   * supports the File API.
   *
   * Otherwise, submits the form, sending the file to the remote server.
   *
   * @param {Event} event - The change event.
   *
   * TODO:
   * - Warn user when submitting to server
   * - EventStream could give progress on server-side parsing
   */
  onUploadFile: function() {
    // Determine whether to process the file client- or server-side
    if (this.canReadLocal()) {
      // Resets the progress view to its default state
      this.trigger('progress:restart')
      this.readFile(this.ui.file[0].files[0]);
    } else {
      // Uploads file to server. Warn here?
      this.ui.uploadForm.submit()
    }
  },

  /*
   * Loads the sample datafile from the server.
   */
  onSampleFile: function() {
    // Resets the progress view to its default state
    this.trigger('progress:restart')

    // Initiate AJAX request for sample json data
    $.ajax({
      method: 'get',
      url: '/sample',
      success: this.saveFile.bind(this)
    });
  },

  /*
   * Feature detection to determine if the user can download a remote file
   * as a binary blob on the client-side.
   *
   * To do so, their browser must support XHR Response Type "Blob"
   */
  canDownloadLocal: function() {
    return Modernizr.xhrresponsetypeblob;
  },

  /*
   * Feature detection to determine if the user can read a binary blob
   * on the client-side.
   *
   * To do so, their browser must support the File API
   */
  canReadLocal: function() {
    return Modernizr.filereader;
  },

  /*
   * Downloads the file from the remote URL as a binary blob.
   * TODO:
   * - Better error handling. e.g. invalid URL is provided, CORS issue
   */
  downloadLocal: function() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", this.ui.url.val(), true);
    xhr.responseType = "blob";
    xhr.onprogress = this.downloadProgress.bind(this);
    xhr.onerror = this.downloadError.bind(this);
    xhr.onload = this.processBlob.bind(this);
    xhr.send();
  },

  /*
   * Downloads and reads the file remotely on the server.
   * The server should respond with the parsed JSON.
   *
   * TODO:
   * - EventStream could give progress on server-side download + parsing
   * - Better error handling, e.g. file not found, or not a supported mimetype.
   */
  downloadRemote: function() {
    this.trigger('progress:downloading');

    $.ajax({
      method: 'post',
      data: { url: this.ui.url.val() },
      url: this.ui.downloadForm.attr('action'),
      success: this.saveFile.bind(this),
      error: this.downloadError.bind(this)
    });
  },

  /*
   * Saves the file to sessionStorage
   *
   * @param {object} json - JSON data obtained from parser
   */
  saveFile: function(json) {
    this.model.set(json).save(json);
    this.trigger('progress:start');
  },

  /*
   * Reads the file locally using the File API
   *
   * @param {blob} file - Binary blob representing the datafile
   */
  readFile: function(file) {
    // Instantiate a new FileReader object
  	var reader = new FileReader();

    // Update datafile model with selected filename
    app.datafile.set('name', file.name);

    reader.onprogress = this.readProgress.bind(this);
    reader.onloadend = this.parseFile.bind(this);

    // Read the file as binary data
    reader.readAsBinaryString(file);
  },

  /*
   * Attempts to parse a binary blob using one of the registered parsers.
   * TODO:
   * - Better error handling
   */
  parseFile: function(event) {
    var saveFile = this.saveFile.bind(this);
    app.datafile.read(event.target.result, function(err, data) {
      if (err) console.error(err);
      app.datafile.set('data', data);
      saveFile(app.datafile.toJSON());
    });
  },

  /*
   * Handles xhr blob response before reading
   *
   * @param {object} event - XMLHttpRequestProgressEvent object representing
   * the blob response.
   */
  processBlob: function(event) {
    var blob = event.target.response;
    blob.lastModifiedDate = new Date();
    blob.name = path.basename(event.target.responseURL);
    this.readFile(blob);
  },

  /*
   * Handles xhr progress events by updating the progress popup
   *
   * @param {object} event - XMLHttpRequestProgressEvent object
   */
  downloadProgress: function(event) {
    if (event.lengthComputable) {
      let percent = event.loaded / event.total;
      this.progress.progress( percent, 'Downloading...' );
    }
  },

  /*
   * Handles xhr error events by destroying the progress popup
   *
   * @param {object} event - XMLHttpRequestProgressEvent object
   *
   * TODO:
   * - Better error handing + feedback for the user. e.g. CORS errors...
   */
  downloadError: function(event) {
    console.error(event);
    this.progress.destroy();
  },

  /*
   * Handles FileReader progress events by updating the progress popup
   *
   * @param {object} event - ProgressEvent object
   */
  readProgress: function(event) {
    if (event.lengthComputable) {
      let percent = event.loaded / event.total;
      this.progress.progress( percent, 'Reading...' );
    }
  }
});

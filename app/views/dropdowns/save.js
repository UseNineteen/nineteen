'use strict';

let _ = require('underscore');
let $ = require('jquery');
let path = require('path');
let JSZip = require('jszip');
let Dropdown = require('./_base');

module.exports = Dropdown.extend({
  attributes: {
    'data-html2canvas-ignore': true
  },

  template: require('../../templates/dropdowns/save.hbs'),

  ui: {
    html: '.save-html',
    png: '.save-png',
    htmlDesc: '.save-html .description',
    pngDesc: '.save-png .description'
  },

  events: {
    'click @ui.html': 'destroy',
    'click @ui.png': 'destroy',
  },

  onRender: function() {
    this.$el.addClass('dropdown-right dropdown-save');
    if (this.options.visualization) {
      this.generateHTML();
      this.generateImage();
    }
  },

  generateHTML: function() {
    let link = this.ui.html;
    let description = this.ui.htmlDesc;
    let text = this.ui.htmlDesc.text();
    this.ui.htmlDesc.text('Generating archive...');

    var reader = new FileReader();
    var json = JSON.stringify(this.parentView.export());

    reader.onloadend = function() {
      let zip = new require('jszip')();
      zip.load(reader.result);
      zip.folder('assets').file('data.js', `var NINETEEN_LOCAL = true, NINETEEN_DATA = JSON.parse(${json});`);
      let blob = zip.generate({ type: 'blob', compression: 'DEFLATE' });
      link.attr('href', window.URL.createObjectURL(blob));
      description.text(text);
    };

    var xhr = new XMLHttpRequest();
    xhr.open("GET", '/save', true);
    xhr.responseType = "blob";
    xhr.onerror = reader.onerror = function(event) {
      description.text('Error generating archive.');
    };
    xhr.onload = function(event) {
      let data = reader.readAsBinaryString(xhr.response);

    };
    xhr.send();
  },

  generateImage: function() {
    let $content = this.options.visualization;
    let description = this.ui.pngDesc.text();
    this.ui.pngDesc.text('Generating image...');
		html2canvas($content, {
      height: 2000,
      onrendered: function(canvas) {
        this.ui.pngDesc.text(description)
  		  this.ui.png.attr('href', canvas.toDataURL());
  		}.bind(this)
    });
  }
});

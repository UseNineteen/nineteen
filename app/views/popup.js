'use strict';

let $ = require('jquery');
let _ = require('underscore');
let d3 = require('d3');
let mime = require('mime');
let Autolinker = require('autolinker');
let Backbone = require('backbone');
let Marionette = require('backbone.marionette');
let interact = require('interact.js');

let ItemView = Marionette.ItemView.extend({
  tagName: 'p',
  template: require('../templates/popup_row.hbs'),

  ui: {
    value: '.value'
  },

  initialize: function(options) {
    this.search = options.search;
    this.listenTo(this.search, 'change:term', this.render);
  },

  onRender: function(value) {
    let search = this.search;
    let model = this.model.get('data');
    this.ui.value.contents().each(function(){
      // Only select Node.TEXT_NODE
      // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
      if (this.nodeType == 3) {
        let next = this;
        let offset = 0;
        let matches = search.getTerm( model, this.nodeValue ).sort(function(a,b) {
          return d3.ascending(a.index, b.index);
        });

        for (let match of matches) {
          let mark = document.createElement('mark');
          next = next.splitText(match.index - offset);
          next.textContent = next.textContent.slice(match[0].length);
          next.parentNode.insertBefore(mark, next);
          mark.textContent = match[0];
          offset = match.index + match[0].length;
        }
      }
    });
  }
});

let EmptyView = Marionette.ItemView.extend({
  className: 'empty',
  tagName: 'p',
  template: false,
  onRender: function() {
    this.$el.text('Please select some columns');
  }
});

module.exports = Marionette.CompositeView.extend({
  defaults: {
    pos: [0, 0]
  },

  className: 'popup',
  childView: ItemView,
  childViewContainer: 'section',
  childViewOptions: function() {
    return {
      search: this.search
    }
  },
  emptyView: EmptyView,
  tagName: 'article',
  template: require('../templates/popup.hbs'),

  ui: {
    close: '.close',
    header: 'header',
    content: 'section'
  },

  events: {
    'click @ui.close': 'hide',
    'mouseover': 'mouseover',
    'mouseout': 'hide',
    'mousedown @ui.header': 'bringToFront'
  },

  initialize: function(options) {
    this.options = _.extend({}, this.defaults, options);
    this.search = options.search;
    this.listenTo(options.viewer.get('viewer-columns'), 'reset', this.build);
    this.listenTo(this.model, 'mouseout', this.hide);
    this.listenTo(this.model, 'click', this.float);
    this.on('float', this.movable);
    this.on('float', this.resizable);
    this.build( options.viewer.get('viewer-columns') );
  },

  build: function(columns) {
    let model = this.model;
    let attrs = this.model.get('raw');
    let options = { stripPrefix: false, replaceFn: this.autolink };
    this.collection = new Backbone.Collection( columns.pluck('name').map(function(key) {
      let string = _.escape(attrs[key]);
      return { label: key, value: Autolinker.link(string, options), data: model };
    }));
    this.render();
  },

  autolink: function(autolinker, match) {
    let href = match.getAnchorHref();
    let type = mime.lookup(href);
    if (type.indexOf('image') !== -1) {
      return `<img src="${href}"/>`;
    } else {
      return true;
    }
  },

  onRender: function() {
    let [x, y] = this.options.pos;
    let selection = d3.select(this.el);
    if (x + this.$el.width() > window.innerWidth && x - this.$el.width() > 0) this.$el.addClass('popup-right');
    if (y + this.$el.height() > window.innerHeight && y - this.$el.height() > 0) this.$el.addClass('popup-bottom');
    selection.style('left', x + 'px').style('top', y + 'px');
    this.$el.css('background-color', this.options.color);
    this.bringToFront();
  },

  bringToFront: function() {
    let $siblings = this.$el.siblings();
    let top = d3.max($siblings.toArray(), function(el) {
      return parseFloat($(el).css('z-index')) + 1;
    });
    if (top) this.$el.css('z-index', top)
  },

  float: function() {
    this.stopListening(this.model);
    this.listenTo(this.model, 'click', this.dock);
    this.$el.addClass('floating');
    if (this.$el.hasClass('popup-right')) {
      this.options.pos[0] -= this.$el.width() - 62;
      this.$el.css('left', this.options.pos[0] + 'px');
      this.$el.removeClass('popup-right');
    }
    this.trigger('float');
    this.undelegate('mouseout');
  },

  dock: function() {
    this.$el.removeClass('floating');
    this.listenTo(this.model, 'click', this.float);
    this.listenTo(this.model, 'mouseout', this.hide);
    this.trigger('dock');
  },

  movable: function() {
    interact(this.ui.header[0]).draggable({
      onmove: this.move.bind(this)
    });
  },

  resizable: function() {
    interact(this.ui.content[0]).resizable({
      autoScroll: true,
      preserveAspectRatio: false,
      edges: { left: false, right: true, bottom: true, top: false },
      onmove: this.resize.bind(this)
    });
  },

  move: function(event) {
    let [x, y] = this.options.pos;
    x += event.dx;
    y += event.dy;
    d3.select(this.el).style('left', x + 'px').style('top', y + 'px');
    this.options.pos = [x, y];
  },

  resize: function (event) {
    let [x, y] = this.options.pos;

    x += event.deltaRect.left;
    y += event.deltaRect.top;

    d3.select(this.el).style({
      'width': event.rect.width + 'px',
      'height': event.rect.height + 'px',
      'left': x + 'px',
      'top': y + 'px'
    });

    this.options.pos = [x, y];
  },

  show: function() {
    d3.select(this.el).style('opacity', 0).transition().duration(50).delay(50).style('opacity', 1);
  },

  mouseover: function() {
    this.stopListening(this.model, 'mouseout', this.hide);
    clearTimeout(this.hiding);
  },

  hide: function() {
    let selection = d3.select(this.el);
    let destroy = this.destroy.bind(this);
    this.hiding = setTimeout(function() {
      selection.transition().duration(50).style('opacity', 0).each('end', destroy);
    }, 50);
    // Clicking the close button makes the popup think you are moving it
    // this triggers a cursor change on the HTML element
    // which is not reverted once the element is destroyed.
    // TODO: Find a more elegant solution for this
    d3.select('html').style('cursor', null);
  }
});

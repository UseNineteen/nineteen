'use strict';

var _ = require('underscore');
var $ = require('jquery');
var d3 = require('d3');
var Backbone = require('backbone');
var Marionette = require('backbone.marionette');
let Search = require('../models/search');

module.exports = Marionette.LayoutView.extend({
  className: 'viewer-wrapper',

  defaults: {
    gutter: 3,
    row: 26,
    labelWidth: 145,
    size: 18,
    stroke: 5,
    radius: 2
  },

  template: require('../templates/viewer.hbs'),
  regions: {
    rows: '.rows',
    labels: '.labels',
    blocks: '.blocks'
  },

  ui: {
    visualizer: '.visualizer',
    header: 'header',
    sort: 'input[name="sort"]',
    labels: '.labels',
    blocks: '.blocks .block-items',
    rows: '.rows .row-items',
    wrapper: '.blocks .wrapper',

    search: '#search',
    searchIcon: '#search-icon',
    searchIn: '#search-in',
		viewerColumns: '#viewer-columns',
		sorting: '.block-sort',
		toggleCounts: '#toggle-counts',
		toggleView: '#toggle-view',
    zoomControls: '#zoom-controls button',
		zoomIn: '#zoom-controls .zoom-in',
    zoomOut: '#zoom-controls .zoom-out',
    zoomReset: '#zoom-controls .zoom-reset',
    zoomFit: '#zoom-controls .zoom-fit',
  },

  triggers: {
    'submit form': 'submission',
		'click @ui.searchIn': 'searchPopup',
    'click @ui.searchIcon': 'frequency:toggle',
		'click @ui.viewerColumns': 'viewerColumns',
    'click @ui.toggleCounts': 'counts:toggle',
		'click @ui.toggleView': 'toggleView',
    'click @ui.zoomIn': 'zoom:in',
    'click @ui.zoomOut': 'zoom:out',
    'click @ui.zoomReset': 'zoom:reset',
    'click @ui.zoomFit': 'zoom:fit'
  },

  events: {
    'keypress @ui.search': 'onSearch',
		'click @ui.sorting': 'onChangeSort',
    'click @ui.zoomControls': 'captureZoom'
	},

  initialize: function(options) {
    this.options = _.extend(this.defaults, options);
    this.legend = options.legend;
    this.search = new Search({}, { collection: this.collection });;
    this.parent = options.parent;
    this.listenTo(this.model, 'change:counts', function() { this.showCounts(this.model.isSplit()); });
    this.listenTo(this.model, 'change:counts', this.toggleCountsButtonText);
    this.listenTo(this.model, 'change:scaleY', this.showLabels);
    this.listenTo(this.model, 'change:scaleY change:split change:counts', this.showRows);
    this.listenTo(this.model, 'change:scaleX change:scaleY change:split', this.showCounts);
    this.listenTo(this.model, 'change:scaleX change:scaleY change:scaleColor change:split change:counts', this.updateBlocks);
    this.listenTo(this.model, 'change:colorKey', this.onChangeLegend);
    this.listenTo(this.model, 'change:zoom', this.zoom);
    this.listenTo(this.model, 'change:zoom', this.zoomButtons);
    this.listenTo(this.model, 'change:sort-direction', this.onChangeDirection);
    this.listenTo(this.model, 'change:split', this.updateRowWidth);
    this.listenTo(this.search, 'change', this.highlight);
    this.listenTo(this.search.get('scope'), 'add remove reset', this.updateSearchWithinText);

    // View events
    this.on('counts:toggle', this.model.toggleCounts, this.model);
    this.on('zoom:in', this.model.zoomIn, this.model);
    this.on('zoom:out', this.model.zoomOut, this.model);
    this.on('zoom:reset', this.model.zoomReset, this.model);
  },

  onAttach: function() {
    this.fontSize = parseInt(this.$el.css('font-size'));
    this.showRows();
    this.showBlocks();
    this.showLabels();

    // Bind #search input to search term attribute
    this.stickit(this.search, { '#search-field': 'term', '#search-export': 'term' });

    // When resizing the window, Best Fit button should re-enable
		$(window).resize(this.zoomButtons.bind(this));

    // ?
    this.ui.toggleView.prop('disabled', this.model.isAutomatic());
  },

  /**
   * Creates data blocks in the DOM.
   * Each data block represents a row in the datafile.
   */
  showBlocks: function() {
    this.blocks = d3.select(this.ui.blocks[0])
      .style('font-size', this.model.get('zoom') * 13 + 'px')
      .selectAll('.block-item')
      .data(this.collection.models);

    let popup = this.popup.bind(this);

    this.blocks.enter().append('div').attr('class', 'block-item')
      .on('mouseover', function(d,i) { popup(d, i, d3.select(this)); })
      .on('mouseout', this.mouseout.bind(this))
      .on('click', this.click);

    this.updateBlocks();
    this.showCounts(false);
  },

  /**
   * Update block DOM styles.
   */
  updateBlocks: function() {
    // Sort the collection so that we have the correct block positions
    this.collection.sort();

    // Set up local variables
    let color = this.model.getColor.bind(this.model);
    let options = this.options;
    let x = this.getX.bind(this);
    let y = this.getY.bind(this);
    let fontSize = this.fontSize;
    let zoom = this.model.get('zoom');

    // Update DOM element styles
    this.blocks.each(function(d,i) {
      let el = d3.select(this);
      el.style({
        'width': options.size / fontSize + 'em',
        'height': options.size / fontSize + 'em',
        'background-color': color(d,'fill'),
        'border-color': color(d,'stroke')
      }).transition().duration(1100).styleTween('transform', function(d,i,a) {
        let match = /matrix\(\d+, \d+, \d+, \d+, ([\d\.]+), ([\d\.]+)\)/g.exec(a);
        let ax, ay;
        if (match) {
          ax = parseFloat(match[1]) / fontSize / zoom;
          ay = parseFloat(match[2]) / fontSize / zoom;
        }
        a = `translate(${ax}em, ${ay}em)`
        let b = `translate(${x(d) / fontSize}em, ${y(d) / fontSize}em)`;
        return d3.interpolate(a, b);
      });
    });
  },

  /**
   * Create counts in the DOM.
   * Counts show the total number of data items in a row.
   */
  showCounts: function(transition) {
    // Create counts selection
    let collection;
    if (this.model.isSplit()) {
      collection = this.collection.rollup(this.model.get('colorKey'), this.model.get('groupKey'));
    } else {
      collection = this.collection.rollup(this.model.get('groupKey'));
    }
    let counts = d3.select(this.ui.blocks[0])
      .selectAll('.block-item-label')
      .data(collection);

    // Only display the counts if the user has turned them on
    if (this.model.showCounts()) {
      // Enter the selection data
      counts.enter().append('div').attr('class', 'block-item block-item-label');

      // Set up local variables
      let model = this.model;
      let x = this.getX.bind(this);
      let y = this.getY.bind(this);
      let fontSize = this.fontSize;

      // Update DOM style to position the counts at the end of their row
      counts.style('transform', function(d,i) {
        let col;
        if (model.isSplit()) {
          col = model.getX( d.items.last() ) + 1;
        } else {
          col = d.count;
        }
        let row = model.getY( d.items.last() );
        return `translate(${x(null, col) / fontSize}em, ${y(null, row) / fontSize}em)`
      }).style('line-height', this.options.size / fontSize + 'em').text(function(d) { return d.count; });

      // Transition the count opacity
      if (transition) {
        counts.style('opacity', 0)
          .transition().duration(300).delay(800)
          .style('opacity', 1);
      }

      // Exit the selection data
      // Remove any old DOM elements
      counts.exit().remove();
    } else {
      // Remove existing counts
      counts.remove();
    }
  },

  /**
   * Create labels in the DOM.
   * Labels represent each unique value within the grouping column.
   */
  showLabels: function() {
    let maxWidth = 0;
    let labels = d3.select(this.el).select(this.regions.labels).html('')
      .style('font-size', this.model.get('zoom') * 13 + 'px')
      .selectAll('.label-item')
      .data(this.model.labels.models);

    labels.enter().append('div')
      .attr('class', 'label-item')
      .text(function(d) { return d.get('label'); });

    let zoom = this.model.get('zoom');
    let width = this.ui.labels.width() / zoom;
    d3.select(this.ui.blocks[0]).style('padding-left', width / this.fontSize + 'em');
    d3.select(this.ui.rows[0]).style('padding-left', width / this.fontSize + 'em');
  },

  /**
   * Create rows in the DOM.
   * Rows group data blocks by the value of their grouping column.
   */
  showRows: function() {
    d3.select(this.ui.rows[0]).html('')
      .style('font-size', this.model.get('zoom') * 13 + 'px')
      .selectAll('.row')
      .data(this.model.labels.models)
      .enter().append('div')
      .attr('class', 'row')
      .call(this.updateRowWidth.bind(this));
  },

  /**
   * Updates the width of rows in the DOM.
   * This is necessary after switching between view modes.
   */
  updateRowWidth: function() {
    let width = this.calculateRowWidth();
    d3.select(this.ui.rows[0]).selectAll('.row').style('width', width / this.fontSize + 'em');
  },

  /**
   * Calculate X position based on view options and provided index.
   * @param (object) model - DataItem model we are considering.
   * @param (integer) index - Index of the model within its row siblings.
   * @return (integer) - The computed x-position in pixels.
   */
  getX: function(model, index) {
    if (index === undefined) index = this.model.getX( model );
    var step = this.options.size + this.options.gutter;
    var inset = 0; // this.options.labelWidth;
    return index * step + inset + this.options.gutter;
  },

  /**
   * Calculate Y position based on view options and provided index.
   * @param (object) model - DataItem model we are considering.
   * @param (integer) index - Index of the model's label within the label collection.
   * @return (integer) - The computed y-position in pixels.
   */
  getY: function(model, index) {
    if (index === undefined) index = this.model.getY( model );
    var offset = (this.options.row - this.options.size) / this.options.gutter / 2 + (this.options.row - this.options.size - this.options.gutter);
    return index * this.options.row - this.options.size - offset;
  },

  /**
   * Check to see if the model matches the current search term.
   * @param (object) model - DataItem model we are considering.
   * @return (boolean) - Whether or not the model contains the search term.
   */
  match: function(model) {
    if (!this.search.hasTerm()) return false;
    return !this.search.match(model);
  },

  /**
   * Fired when one of the sorting buttons is clicked
   * If the currently active button was clicked, reverses the sort direction.
   * Otherwise, sets the sort-by attribute and sort-direction attribute to the button's current values
   */
  onChangeSort: function(event) {
    // Cache jQuery selection of the event target
		let $target = $(event.target);

    // Add the `sort-active` class to the event target if not already present
    $target.addClass('sort-active');

    // Remove the `sort-active` class from the sorting button that was not clicked
    this.ui.sorting.not($target).removeClass('sort-active');

    // Determine the clicked button's `sort-direction`
    // If it has the `sort-reverse` class, the current `sort-direction` is 'descending'
    // Otherwise the current `sort-direction` is 'ascending'
    let direction = $target.hasClass('sort-reverse') ? 'descending' : 'ascending';

    // Check if the clicked button is the currently active one
    if (event.target.value === this.model.get('sort-by')) {
      // If so, reverse the sorting direction
      this.model.reverse(direction);
    } else {
      // Othersize, update the `sort-direction` and `sort-by` values
      // to those of the clicked button
      this.model.set({
        'sort-direction': direction,
        'sort-by': event.target.value
      });
    }
	},

  /**
   * Runs when the legend key changes
   * This is necessary to disable the split view when the legend key
   * is set to automatic, causing each row to contain only one split group
   */
  onChangeLegend: function() {
    let automatic = this.model.isAutomatic();
    if (automatic) this.model.set('split', false);
    this.ui.toggleView.prop('disabled', automatic);
  },

  /**
   * Enables/disables the show counts button
   * Currently split view does not support counts within each group
   * As such, the option should be disabled when in split mode
   */
	onChangeDirection: function(model, value) {
		let $el = this.ui.sorting.filter(`[value="${model.get('sort-by')}"]`);
		$el.toggleClass('sort-reverse', value === 'descending');
	},

  /***
   * Updates the text of the toggleCounts button
   */
	toggleCountsButtonText: function() {
    let text = this.model.showCounts() ? 'Hide' : 'Show';
		this.ui.toggleCounts.find('.count-label').text(`${text} counts`);
	},

  /**
   * Handles click events on the view toggle
   * Updates the split viewer model attribute,
   * as well as the button text/icon
   */
	onToggleView: function() {
		let split = this.model.toggleSplit();
		this.ui.toggleView.text(split ? 'Stack' : 'Split');
		this.ui.toggleView.toggleClass('view-split', !split);
		this.ui.toggleView.toggleClass('view-stack', split);
	},

  /**
   * Handles click events on the "Search In" pulldown
   * Displays the column picker popup
   */
  onSearchPopup: function(event) {
		let Dropdown = require('./dropdowns/search-in');
		let region = this.parent.getRegion('dropdowns');
		let $target = this.ui.searchIn;
		if (region.hasView() && region.currentView.$target.is($target)) {
			region.reset();
		} else {
			let pos = $target.offset();
			let model = new Backbone.Model({
				columns: this.collection.columns.map(function(column) { return {name: column }; }),
				selected: this.search.get('scope')
			});
			let view = new Dropdown({
				model: model,
				$target: $target,
				pos: [pos.left + $target.outerWidth(), pos.top + $target.outerHeight()]
			});
			region.show(view);
		}
	},

  /**
   * Updates search-in dropdown text when the search columns change
   */
  updateSearchWithinText: function() {
    let columns = this.collection.columns;
    let scope = this.search.get('scope');
    let $el = this.ui.searchIn.find('strong');
    if (scope.length === columns.length) {
      $el.text('all fields');
    } else if (scope.length === 1) {
      $el.text('one field');
    } else if (scope.length > 1) {
      $el.text('some fields');
    } else {
      $el.text('no fields');
    }
  },

  /**
   * Handles click events on the "Show in Viewer" pulldown
   * Displays the column picker popup
   */
	onViewerColumns: function() {
		let Dropdown = require('./dropdowns/viewer-columns');
		let region = this.parent.getRegion('dropdowns');
		let $target = this.ui.viewerColumns;
		if (region.hasView() && region.currentView.$target.is($target)) {
			region.reset();
		} else {
			let pos = $target.offset();
			let model = new Backbone.Model({
				columns: this.collection.columns.map(function(column) { return {name: column }; }),
				selected: this.model.get('viewer-columns'),
			});
			let view = new Dropdown({
				model: model,
				$target: $target,
				pos: [pos.left + $target.outerWidth(), pos.top + $target.outerHeight()]
			});
			region.show(view);
		}
	},

  /**
   * Prevents the Enter key from triggering search events
   */
  onSearch: function(event) {
    let enter = 13;
    if (event.keyCode === enter) {
      event.preventDefault();
    }
  },

  /**
   * Triggers a new popup (viewer) window
   * @param (object) model - The DataItem model of the target data block
   * @param (integer) index - The index of the data block in the collection
   * @param (object) el - The DOM Element of the data block
   */
  popup: function(model, index, el) {
    let offset = $(el.node()).offset();
    let Popup = require('./popup');
    let view = new Popup({
      viewer: this.model,
      search: this.search,
      model: model,
      color: this.model.getColor( model, 'fill' ),
      pos: [offset.left, offset.top + this.options.size]
    });

    app.regions.get('main').$el.append(view.el);
    view.render().show();

    this.listenTo(view, 'float', function() {
      el.on('mouseover', null);
      el.on('mouseover', this.mouseover.bind(this));
      el.classed('floating', true);
    });

    this.listenTo(view, 'dock', function() {
      el.on('mouseover', null);
      el.on('mouseover', this.mouseover.bind(this));
      el.classed('floating', false);
    });

    this.listenTo(view, 'destroy', function() {
      let popup = this.popup.bind(this);
      el.on('mouseover', null);
      el.on('mouseover', function(d, i) { popup(d, i, el); });
      el.classed('floating', false);
    });

    this.mouseover( model, index);
  },

  /**
   * Handles mouseover events for data blocks
   * Mousing over a data item will show its popup and highlight its legend item
   * @param (object) model - The DataItem model of the target data block
   */
  mouseover: function(model) {
    var key = this.model.get('colorKey');
    var item = this.model.legend.findWhere({ label: model.get('raw')[key] });
    if (item) item.trigger('mouseover');
  },

  /**
   * Handles mouseout events for data blocks
   * Mousing out will destroy the data items popup
   * and restore opacity of legend items
   * @param (object) model - The DataItem model of the target data block
   */
  mouseout: function(model) {
    var key = this.model.get('colorKey');
    var item = this.model.legend.findWhere({ label: model.get('raw')[key] });
    if (item) item.trigger('mouseout');
    model.trigger('mouseout');
  },

  /**
   * Handles click events for data blocks
   * Clicking a data block with "float" its popup (unbinds mouseout destroy)
   * @param (object) model - The DataItem model of the target data block
   */
  click: function(model) {
    model.trigger('click');
  },

  /**
   * Grays back blocks based on whether they contain the current search term
   */
  highlight: function() {
    let blocks = d3.select(this.el).select('svg').select(this.regions.blocks).selectAll('.block-item');
    this.blocks.classed('filtered', this.match.bind(this));
  },

  /**
   * Updates the view based on changes in the viewer model's `zoom` attribute
   */
  zoom: function() {
    let zoom = this.model.get('zoom');
    d3.select(this.ui.labels[0]).transition().duration(100).style('font-size', zoom * 13 + 'px');
    d3.select(this.ui.rows[0]).transition().duration(100).style('font-size', zoom * 13 + 'px');
    // Adding the `zooming` class before updating prevents the value from using CSS3 transitioning
    d3.select(this.ui.blocks[0]).transition().duration(100).style('font-size', zoom * 13 + 'px');
  },

  /**
   * Enables/Disables zoom buttons based on the current zoom level
   */
	zoomButtons: function() {
		let zoom = this.model.get('zoom');
		this.ui.zoomReset.prop('disabled', zoom === 1);
		this.ui.zoomFit.prop('disabled', zoom === this.calculateZoomFit());
	},

  /**
   * Updates model zoom attribute so that entire visualization fits
   * within the browser viewport
   */
	onZoomFit: function() {
		this.model.set('zoom', this.calculateZoomFit());
	},

  /***
   * Clears focus from zoom buttons when clicked
   * @param {object} event jQuery ClickEvent
   */
  captureZoom: function(event) {
    $(event.currentTarget).blur();
  },

  /**
   * Computes the total width needed to display the visualization
   */
  calculateRowWidth: function() {
    let cols;
    // if we are in split mode, things are gonna be a whole lot wider
    if (this.model.get('split')) {
      cols = this.model.getOffsetX( this.model.get('groupKey') );
    } else {
      cols = this.model.maxCount();
    }
    return this.getX(null, cols) + (3 * this.options.size);
  },

  /**
   * Computes the zoom value necessary to fit the visualization in the viewport
   */
	calculateZoomFit: function() {
    let zoom = this.model.get('zoom');
    let labelWidth = this.ui.labels.width() / zoom;
    let rowWidth = this.calculateRowWidth();
    let viewportWidth = labelWidth + rowWidth;
		return Math.min((this.$el.width() / viewportWidth), (this.$el.height() / (this.model.rows() * 28)));
	},

  onFrequencyToggle: function() {
    let Dropdown = require('./dropdowns/term-frequency');
		let region = this.parent.getRegion('dropdowns');
		let $target = this.ui.searchIcon;
		if (region.hasView() && region.currentView.$target.is($target)) {
			region.reset();
		} else {
			let pos = $target.offset();
			let view = new Dropdown({
				model: this.search,
				$target: $target,
				pos: [pos.left - 35, pos.top + $target.outerHeight()]
			});
			region.show(view);
		}
  }
});

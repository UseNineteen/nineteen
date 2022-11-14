// 'use strict';
//
// let _ = require('underscore');
// let Backbone = require('backbone');
// let DataItems = require( root.join('app/collections/data_items') );
// let Legend = require( root.join('app/models/legend') );
//
// describe('Legend Model', function() {
//   let model, items;
//
//   beforeEach(function() {
//     items = new DataItems( [fixture('data.json')] );
//     model = new Legend({ key: 'Name' }, { collection: items });
//   });
//
//   describe('#initialize', function() {
//     it('creates an empty items collection', function() {
//       assert.instanceOf(model.items, Backbone.Collection);
//     });
//
//     it('calls #buildCollection when key changes', function() {
//       assert.property(model._events, 'change:key');
//       let callbacks = _.pluck(model._events['change:key'], 'callback');
//       assert.include(callbacks, model.buildCollection);
//     });
//   });
//
//   describe('#buildCollection', function() {
//     let rollupAge = [{
//       label: '25',
//       value: 25,
//       count: 1
//     }];
//
//     beforeEach(function() {
//       sinon.stub(items, 'rollup').returns(rollupAge);
//       sinon.stub(items, 'reset');
//       sinon.stub(model, 'calculateScale');
//     });
//
//     afterEach(function() {
//       items.rollup.restore();
//       model.calculateScale.restore();
//     });
//
//     it('calls collection#rollup', function() {
//       assert(!items.rollup.called, 'collection#rollup already called');
//       model.buildCollection(model, 'Age');
//       assert(items.rollup.called, 'collection#rollup not called');
//     });
//
//     it('triggers the reset event on the items collection', function(done) {
//       model.items.on('reset', function() { done(); });
//       model.buildCollection(model, 'Age');
//     });
//
//     it('returns the modified items collection', function() {
//       assert.deepEqual(model.buildCollection(model, 'Age'), model.items);
//     });
//   });
//
//   describe('#calculateScale', function() {
//     let values = [ 'Cody', 'Kim', 'Ted' ];
//     beforeEach(function() {
//       sinon.stub(model.items, 'pluck').returns(values);
//     });
//
//     it('updates the domain of the ordinal scale', function() {
//       model.calculateScale( model.items );
//       assert.deepEqual(model.get('scale').domain(), values);
//     });
//
//     it('returns the newly updated scale', function() {
//       let actual = model.calculateScale( model.items );
//       assert.deepEqual(actual, model.get('scale'));
//     });
//   });
// });

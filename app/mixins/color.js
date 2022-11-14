var _ = require('underscore');
var d3 = require('d3');
var core = [
  // ====================
  // Begin Base
  // ====================
  {
    id: 1,
    order: 1,
    fill: '#0A3BB1',
    stroke: '#0A3BB1'
  },{
    id: 2,
    order: 11,
    fill: '#DC6ECB',
    stroke: '#DC6ECB'
  },{
    id: 3,
    order: 6,
    fill: '#6F6CDC',
    stroke: '#6F6CDC'
  },{
    id: 4,
    order: 12,
    fill: '#F4B7D3',
    stroke: '#F4B7D3'
  },{
    id: 5,
    order: 2,
    fill: '#3396E4',
    stroke: '#3396E4'
  },{
    id: 6,
    order: 13,
    fill: '#7499BD',
    stroke: '#7499BD'
  },{
    id: 7,
    order: 7,
    fill: '#91CCE2',
    stroke: '#91CCE2'
  },{
    id: 8,
    order: 14,
    fill: '#54DDF4',
    stroke: '#54DDF4'
  },{
    id: 9,
    order: 3,
    fill: '#02DE99',
    stroke: '#02DE99',
  },{
    id: 10,
    order: 15,
    fill: '#059370',
    stroke: '#059370'
  },{
    id: 11,
    order: 8,
    fill: '#89D280',
    stroke: '#89D280'
  },{
    id: 12,
    order: 16,
    fill: '#D3D22F',
    stroke: '#D3D22F'
  },{
    id: 13,
    order: 4,
    fill: '#FFD100',
    stroke: '#FFD100'
  },{
    id: 14,
    order: 17,
    fill: '#E5D582',
    stroke: '#E5D582'
  },{
    id: 15,
    order: 9,
    fill: '#EA9333',
    stroke: '#EA9333'
  },{
    id: 16,
    order: 18,
    fill: '#FCBC7C',
    stroke: '#FCBC7C'
  },{
    id: 17,
    order: 5,
    fill: '#D05318',
    stroke: '#D05318'
  },{
    id: 18,
    order: 19,
    fill: '#BCAA93',
    stroke: '#BCAA93'
  },{
    id: 19,
    order: 10,
    fill: '#9B1B49',
    stroke: '#9B1B49'
  },

  // ====================
  // Begin New Colors
  // ====================
  {
    id: 20,
    order: 20,
    fill: '#FF48C3',
    stroke: '#FF48C3'
  },{
    id: 21,
    order: 21,
    fill: '#D20F8C',
    stroke: '#D20F8C'
  },{
    id: 22,
    order: 22,
    fill: '#3BD42E',
    stroke: '#3BD42E'
  },{
    id: 23,
    order: 23,
    fill: '#FF8E6B',
    stroke: '#FF8E6B'
  },{
    id: 24,
    order: 24,
    fill: '#4C746C',
    stroke: '#4C746C'
  },{
    id: 25,
    order: 25,
    fill: '#00A0D5',
    stroke: '#00A0D5'
  },{
    id: 26,
    order: 26,
    fill: '#8D5B33',
    stroke: '#8D5B33'
  },{
    id: 27,
    order: 27,
    fill: '#EACAA7',
    stroke: '#EACAA7'
  },{
    id: 28,
    order: 28,
    fill: '#608A28',
    stroke: '#608A28'
  },{
    id: 29,
    order: 29,
    fill: '#E0C300',
    stroke: '#E0C300'
  },{
    id: 30,
    order: 30,
    fill: '#A8D9C3',
    stroke: '#A8D9C3'
  },{
    id: 31,
    order: 31,
    fill: '#F9E8ED',
    stroke: '#F9E8ED'
  },{
    id: 32,
    order: 32,
    fill: '#CDE5BD',
    stroke: '#CDE5BD'
  },{
    id: 33,
    order: 33,
    fill: '#0069A3',
    stroke: '#0069A3'
  },{
    id: 34,
    order: 34,
    fill: '#FFF100',
    stroke: '#FFF100'
  },{
    id: 35,
    order: 35,
    fill: '#B7B0E9',
    stroke: '#B7B0E9'
  },{
    id: 36,
    order: 36,
    fill: '#00A8BD',
    stroke: '#00A8BD'
  },{
    id: 37,
    order: 37,
    fill: '#A69D29',
    stroke: '#A69D29'
  },{
    id: 38,
    order: 38,
    fill: '#D12229',
    stroke: '#D12229'
  },{
    id: 39,
    order: 39,
    fill: '#792A90',
    stroke: '#792A90'
  }
];

var exclusions = [
  '#0A3BB1',
  '#9B1B49',
  '#8d5b33',
  '#0069a3',
  '#792a90'
];

var colors = [].concat(core);
for (var color of core) {
  if (exclusions.indexOf(color.fill) === -1) {
    colors.push({
      id: colors.length + 1,
      order: colors.length + 1,
      fill: d3.rgb(color.fill).darker(0.7).toString(),
      stroke: color.stroke
    });
  }
};

module.exports.filter = function(limit) {
  return colors.filter(function(color) {
    return color.order <= limit;
  });
};

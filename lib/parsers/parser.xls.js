var xls = require('xlsx');

module.exports = function(data, callback) {
  var wb = xls.read(data, {type: 'binary'});
  var sheet = wb.Sheets[wb.SheetNames[0]];
  var json = xls.utils.sheet_to_json(sheet);
  if (callback) callback(null, json);
  return json;
};

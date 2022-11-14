var xlsx = require('xlsx');

module.exports = function(data, callback) {
  var wb = xlsx.read(data, {type: 'binary'});
  var sheet = wb.Sheets[wb.SheetNames[0]];
  var json = xlsx.utils.sheet_to_json(sheet);
  if (callback) callback(null, json);
  return json;
};

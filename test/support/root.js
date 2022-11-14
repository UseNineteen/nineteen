var path = require('path');

function root() {
  return path.join(__dirname, '..', '..');
}

root.join = function() {
  var file = path.join.apply(this, arguments);
  return path.join(root(), file);
}

module.exports = root;

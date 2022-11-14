var sessionStorage = {};
module.exports = {
  setItem: function(key, value) {
    sessionStorage[key] = value || '';
  },
  getItem: function(key) {
    return sessionStorage[key];
  },
  removeItem: function(key) {
    delete sessionStorage[key];
  }
};

const { server } = require('../tmdb_addon_v2.js');

module.exports = (req, res) => {
  server.emit('request', req, res);
};

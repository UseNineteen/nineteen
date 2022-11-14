var request = require('supertest')(app);
var nock = require('nock');
var path = require('path');

describe('Data file selection process', function() {
  describe('POST /upload', function() {
    it('responds with json', function(done) {
      var filename = 'data.xlsx';
      var file = fixture.resolve(filename);
      var json = {
        data: [ fixture('data.json') ],
        name: filename
      };

      request.post('/upload').type('form')
        .attach('file', file)
        .expect(302, 'Found. Redirecting to /visualize', done);
    });
  });

  describe('POST /download', function() {
    it.skip('responds with json', function(done) {
      var filename = 'sample.xlsx'
      var file = fixture.resolve(filename);

      nock('http://www.example.com')
        .get('/' + filename)
        .replyWithFile(200, file);

      request.post('/download')
        .send({ url: 'http://www.example.com/' + filename })
        .expect('Content-Type', /json/)
        .expect(200, fixture('sample.json'), done);
    });
  });

  describe('GET /sample', function() {
    it('responds with json', function(done) {
      request.get('/sample')
        .expect('Content-Type', /json/)
        .expect(200, fixture('sample.json'), done);
    });
  });
});

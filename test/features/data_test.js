'use strict';

let nock = require('nock');

describe('Loading data', function() {
  // const browser = new Browser();
  //
  // describe('Uploading a file', function() {
  //   before(function(done) {
  //     browser.visit('/', done);
  //   });
  //
  //   it.skip('should process uploaded files', function() {
  //     browser.attach('#file', fixture.resolve('data.xlsx'));
  //     browser.assert.text('#progress', 'Loading data!');
  //   });
  // });
  //
  // describe('Downloading a file', function() {
  //   before(function(done) {
  //     let host = 'http://www.example.com';
  //     let path = 'data.xlsx';
  //     this.url = require('path').join(host, path);
  //     this.request = nock(host).get(`/${path}`).replyWithFile(200, fixture.resolve(path));
  //     browser.visit('/', done);
  //   });
  //
  //   it('should download remote files', function() {
  //     browser.fill('#url', this.url);
  //     browser.pressButton('Go');
  //     browser.assert.text('#progress', 'Loading data');
  //   });
  //
  //   after(function() {
  //     nock.restore();
  //   });
  // });
  //
  // describe('Using sample file', function() {
  //   before(function(done) {
  //     browser.visit('/', done);
  //   });
  //
  //   it.skip('should load the sample data', function(done) {
  //     this.timeout(10000);
  //     window.addEventListener('hashchange', function() {
  //       console.log('here');
  //       browser.assert.text('#title-bar', 'shopping_decision_diary.xlsx');
  //       done();
  //     });
  //
  //     browser.clickLink('#sample');
  //     browser.assert.text('#progress', 'Loading data');
  //   });
  // });
});

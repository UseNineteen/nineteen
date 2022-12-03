'use strict';

let $ = require('jquery');
let Backbone = require('backbone');
let ImportView = require( root.join('app/views/import_view') );
let ProgressView = require( root.join('app', 'views', 'progress') );

describe('ImportView', function() {
  beforeEach(function() {
    this.view = new ImportView({
      model: new Backbone.Model(),
      collection: new Backbone.Collection()
    });
  });

  describe('#render', function() {
    beforeEach(function() {
      this.view.render();
    });

    it('contains the upload form', function() {
      assert.lengthOf(this.view.$('form#upload'), 1);
    });

    it('contains the download form', function() {
      assert.lengthOf(this.view.$('form#download'), 1);
    });

    it('links to sample dataset', function() {
      assert.lengthOf(this.view.$('a:contains(Try an example)'), 1);
    });
  });

  describe('#progressBar', function() {
    it('instantiates a new progress popup', function() {
      assert.instanceOf( this.view.progressBar(), ProgressView, 'progressBar did not return an instance of ProgressView');
      assert.instanceOf( this.view.progress, ProgressView, 'progress is not an instance of ProgressView');
    });

    it('destroys any existing progress popups', function() {
      let spy = sinon.spy();
      this.view.progress = { destroy: spy };
      this.view.progressBar()
      assert(spy.called, 'Existing progress view was not destroyed');
    });

    it('inserts popup after view element', function() {
      $('body').append(this.view.render().el);
      this.view.progressBar();
      assert(this.view.$el.next().is(this.view.progress.el), 'Progress view not found');
    });
  });

  describe('#onDownloadFile', function() {
    it('triggers `progress:restart`', function() {
      let spy = sinon.spy();
      sinon.stub(this.view, 'downloadLocal');
      this.view.on('progress:restart', spy);
      this.view.onDownloadFile();
      assert(spy.called, '`progress:restart` not triggered');
    });

    describe('File API and XHR Blob support', function() {
      before(function() {
        Modernizr = {
          filereader: true,
          xhrresponsetypeblob: true
        };
      });

      it('downloads and reads the file locally', function() {
        sinon.stub(this.view, 'downloadLocal');
        this.view.onDownloadFile();
        assert(this.view.downloadLocal.called, '#downloadLocal never called');
      });
    });

    describe('No File API and XHR Blob support', function() {
      before(function() {
        Modernizr = {
          filereader: false,
          xhrresponsetypeblob: false
        };
      });

      it('downloads and reads the file remotely', function() {
        sinon.stub(this.view, 'downloadRemote');
        this.view.onDownloadFile();
        assert(this.view.downloadRemote.called, '#downloadRemote never called');
      });
    });
  });

  describe('#onChooseFile', function() {
    it('triggers the file browsers popup', function() {
      let spy = sinon.spy();
      this.view.render();
      this.view.ui.file.on('click', spy);
      this.view.onChooseFile();
      assert(spy.called, 'Click event not triggered on file input');
    });
  });

  describe('#onUploadFile', function() {
    beforeEach(function() {
      this.view.render();
    });

    describe('File API support', function() {
      before(function() {
        Modernizr = {
          filereader: true,
          xhrresponsetypeblob: true
        };
      });

      it('triggers `progress:restart`', function() {
        let spy = sinon.spy();
        sinon.stub(this.view, 'readFile');
        this.view.on('progress:restart', spy);
        this.view.onUploadFile();
        assert(spy.called, '`progress:restart` not triggered');
      });

      it('reads the chosen file', function() {
        sinon.stub(this.view, 'readFile');
        this.view.onUploadFile();
        assert(this.view.readFile.called, '#readFile never called');
      });
    })

    describe('No File API support', function() {
      before(function() {
        Modernizr = {
          filereader: false,
          xhrresponsetypeblob: false
        };
      });

      it('submits the upload form', function() {
        let spy = sinon.spy();
        this.view.ui.uploadForm.on('submit', spy);
        this.view.onUploadFile();
        assert(spy.called, 'Upload form never submitted');
      });
    });
  });

  describe('#onSampleFile', function() {
    before(function() {
      sinon.stub($, 'ajax').yieldsTo('success', fixture('sample.json'));
    });

    beforeEach(function() {
      let View = ImportView.extend({ saveFile: sinon.spy() });
      this.view = new View({
        model: new Backbone.Model(),
        collection: new Backbone.Collection()
      });
      this.view.render();
    });

    after(function() {
      $.ajax.restore();
    });

    it('triggers `progress:restart`', function() {
      let spy = sinon.spy();
      this.view.on('progress:restart', spy);
      this.view.onSampleFile();
      assert(spy.called, '`progress:restart` not triggered');
    });

    it('requests sample JSON from the server', function() {
      this.view.onSampleFile();
      assert($.ajax.calledWithMatch({ url: '/sample' }), 'No request was made to `/sample`');
    });

    it('parses returned JSON data', function() {
      this.view.onSampleFile();
      assert(this.view.saveFile.called, '#saveFile not called');
    });
  });

  describe('#canDownloadLocal', function() {
    it('checks if browser supports XHR ResponseType Blob', function() {
      Modernizr.xhrresponsetypeblob = false;
      assert.notOk(this.view.canDownloadLocal());
      Modernizr.xhrresponsetypeblob = true;
      assert.ok(this.view.canDownloadLocal());
    });
  });

  describe('#canReadLocal', function() {
    it('checks if browser supports File API', function() {
      Modernizr.filereader = false;
      assert.notOk(this.view.canReadLocal());
      Modernizr.filereader = true;
      assert.ok(this.view.canReadLocal());
    });
  });

  describe('#downloadLocal', function() {
    before(function() {
      let requests = this.requests = [];
      this.xhr = sinon.useFakeXMLHttpRequest();
      this.xhr.onCreate = function (xhr) {
        requests.push(xhr);
      };
    });

    it.skip('makes XHR Blob request to URL from input field', function() {
      this.view.render();
      this.view.ui.url.val('http://www.example.com/test.csv');
      this.view.downloadLocal();
      assert.equal(this.requests.length, 1)
    });

    after(function() {
      this.xhr.restore();
    })
  });

  describe('#downloadRemote', function() {
    beforeEach(function() {
      sinon.stub($, 'ajax').yieldsTo('success', fixture('sample.json'));
      let View = ImportView.extend({ saveFile: sinon.spy() });
      this.view = new View();
      this.view.render();
    });

    it('triggers downloading state of popup', function() {
      let spy = sinon.spy();
      this.view.on('progress:downloading', spy);
      this.view.downloadRemote();
      assert(spy.called, '`progress:downloading` not triggered');
    });

    it('POSTs download form to server', function() {
      this.view.downloadRemote();
      assert($.ajax.calledWithMatch({ url: '/download' }), 'No request sent to `/download`');
    });

    afterEach(function() {
      $.ajax.restore();
    });
  });

  describe('#saveFile', function() {
    beforeEach(function() {
      let model = {};
      model.save = sinon.stub().returns(model);
      model.set = sinon.stub().returns(model);
      this.view.model = model;
    });

    it('saves JSON data to sessionStorage', function() {
      this.view.saveFile({ name: 'test' });
      assert(this.view.model.save.called, 'DataFile#save not called');
    });

    it('starts parsing JSON data', function() {
      let spy = sinon.spy();
      this.view.on('progress:start', spy);
      this.view.saveFile();
      assert(spy.called, '`progress:start` not triggered');
    });
  });

  describe('#readFile', function() {
    it.skip('reads selected file as binary string');
    it.skip('updates datafile model with selected filename');
  });

  describe('#parseFile', function() {
    it.skip('attempts to convert binary data to JSON');
    it.skip('updated datafile model with converted JSON data');
  });

  describe('#processBlob', function() {
    it.skip('sets blob lastModifiedDate');
    it.skip('sets blob filename');
    it.skip('attempts to read blob data');
  });

  describe('#downloadProgress', function() {
    it.skip('updates progress popup');
  });

  describe('#downloadError', function() {
    it.skip('destroys progress popup');
  });

  describe('#readProgress', function() {
    it.skip('updates progress popup');
  });

  describe('event bindings', function() {
    beforeEach(function() {
      let SpyView = ImportView.extend({
        progressBar: sinon.spy(),
        onDownloadFile: sinon.spy(),
        onChooseFile: sinon.spy(),
        onSampleFile: sinon.spy(),
        onUploadFile: sinon.spy()
      });

      this.view = new SpyView();
      this.view.render();
    });

    it('calls #progressBar when the `progress:restart` event is triggered', function() {
      this.view.trigger('progress:restart');
      assert(this.view.progressBar.called, '#progressBar never called');
    });

    it('calls #onDownloadFile when @ui.downloadForm is submitted', function() {
      this.view.ui.downloadForm.submit();
      assert(this.view.onDownloadFile.called, '#onDownloadFile never called');
    });

    it('calls #onChooseFile when @ui.fileProxy is clicked', function() {
      this.view.ui.fileProxy.click();
      assert(this.view.onChooseFile.called, '#onChooseFile never called');
    });

    it('calls #onSampleFile when @ui.sample is clicked', function() {
      this.view.ui.sample.click();
      assert(this.view.onSampleFile.called, '#onSampleFile never called');
    });

    it('calls #onUploadFile when a @ui.file is changed', function() {
      this.view.ui.file.trigger('change');
      assert(this.view.onUploadFile.called, '#onUploadFile never called');
    });
  });
});

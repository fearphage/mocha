'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var run = require('./helpers').runMocha;
var runJSON = require('./helpers').runMochaJSON;
var map = require('../../lib/utils').map;

describe('regressions', function () {
  it('issue-1327: should run all 3 specs exactly once', function (done) {
    var args = [];
    run('regression/issue-1327.fixture.js', args, function (err, res) {
      var occurences = function (str) {
        var pattern = new RegExp(str, 'g');
        return (res.output.match(pattern) || []).length;
      };

      assert(!err);
      assert.equal(occurences('testbody1'), 1);
      assert.equal(occurences('testbody2'), 1);
      assert.equal(occurences('testbody3'), 1);

      assert.equal(res.code, 1);
      done();
    });
  });

  it('should not duplicate mocha.opts args in process.argv', function () {
    var processArgv = process.argv.join('');
    var mochaOpts = fs.readFileSync(path.join(__dirname, '..', 'mocha.opts'), 'utf-8').split(/[\s]+/).join('');
    assert.notEqual(processArgv.indexOf(mochaOpts), -1, 'process.argv missing mocha.opts');
    assert.equal(processArgv.indexOf(mochaOpts), processArgv.lastIndexOf(mochaOpts), 'process.argv contains duplicated mocha.opts');
  });

  it('issue-1794: Can\'t --require custom UI and use it', function (done) {
    var simpleUiPath = path.join(__dirname, 'fixtures', 'regression', '1794', 'simple-ui.js');
    var args = ['--require', simpleUiPath, '--ui', 'simple-ui'];
    run('regression/1794/issue-1794.fixture.js', args, function (err, res) {
      assert(!err);
      assert.equal(res.code, 0, 'Custom UI should be loaded');
      done();
    });
  });

  it('issue-1991: Declarations do not get cleaned up unless you set them to `null` - Memory Leak', function (done) {
    // on a modern MBP takes ±5 seconds on node 4.0, but on older laptops with node 0.12 ±40 seconds.
    // Could easily take longer on even weaker machines (Travis-CI containers for example).
    this.timeout(120000);
    run('regression/issue-1991.fixture.js', [], function (err, res) {
      assert(!err);
      assert.equal(/process out of memory/.test(res.output), false, 'fixture\'s process out of memory!');
      assert.equal(res.code, 0, 'Runnable fn (it/before[Each]/after[Each]) references should be deleted to avoid memory leaks');
      done();
    });
  });

  describe(
    "issue-2286: after doesn't execute if test was skipped in beforeEach",
    function () {
      /**
       * Generates tests for behavior of `this.skip()`
       * @param {string} name - Name of Runnable abort via `this.skip()`
       * @param {Array.<boolean>} expected - For each of the Runnable types,
       *   whether or not the Runnable should have been run.  The order is
       *   "beforeAll" x 2, "beforeEach" x 2, "test" x 2, "afterEach" x 2, then
       *   "afterAll" x 2.  There should be 10 items in this array.
       * @param {string} [mode=always] - One of 'always' or 'once'
       */
      function testPendingRunnables (name, expected, mode) {
        mode = mode || 'always';
        var spies = [];

        function spy (label) {
          var skip = label === name;

          function wrapped () {
            if ((!wrapped.runCount++ || mode === 'always') && skip) {
              wrapped.skipCount++;
              this.skip();
            }
          }

          wrapped.label = label;
          wrapped.runCount = 0;
          wrapped.skipCount = 0;

          spies.push(wrapped);

          return wrapped;
        }

        describe(name, function () {
          describe('meta', function () {
            before(spy('beforeAll'));
            before(spy('beforeAll'));
            beforeEach(spy('beforeEach'));
            beforeEach(spy('beforeEach'));
            it('might be pending', spy('test'));
            it('might be pending', spy('test'));
            afterEach(spy('afterEach'));
            afterEach(spy('afterEach'));
            after(spy('afterAll'));
            after(spy('afterAll'));
          });

          after(name + ' - ' + mode, function () {
            function countToWords (count) {
              return count === 1
                ? 'once'
                : count === 2
                  ? 'twice'
                  : 'more than twice'
              ;
            }

            map(spies, function (spy) {
              return spy.label + ': ' + (
                spy.skipCount
                ? 'called skip ' + countToWords(spy.skipCount)
                : spy.runCount === 0
                  ? 'skipped'
                  : 'run ' + countToWords(spy.runCount)
              );
            })
              .should
              .deepEqual(expected);
          });
        });
      }

      testPendingRunnables('beforeAll', [
        'beforeAll: called skip once',
        'beforeAll: called skip once',
        'beforeEach: skipped',
        'beforeEach: skipped',
        'test: skipped',
        'test: skipped',
        'afterEach: skipped',
        'afterEach: skipped',
        'afterAll: run once',
        'afterAll: run once'
      ]);

      testPendingRunnables('beforeAll', [
        'beforeAll: called skip once',
        'beforeAll: called skip once',
        'beforeEach: skipped',
        'beforeEach: skipped',
        'test: skipped',
        'test: skipped',
        'afterEach: skipped',
        'afterEach: skipped',
        'afterAll: run once',
        'afterAll: run once'
      ], 'once');

      testPendingRunnables('beforeEach', [
        'beforeAll: run once',
        'beforeAll: run once',
        'beforeEach: called skip twice',
        'beforeEach: called skip twice',
        'test: skipped',
        'test: skipped',
        'afterEach: run twice',
        'afterEach: run twice',
        'afterAll: run once',
        'afterAll: run once'
      ]);

      testPendingRunnables('beforeEach', [
        'beforeAll: run once',
        'beforeAll: run once',
        'beforeEach: called skip once',
        'beforeEach: called skip once',
        'test: skipped',
        'test: run once',
        'afterEach: run twice',
        'afterEach: run twice',
        'afterAll: run once',
        'afterAll: run once'
      ], 'once');

      testPendingRunnables('test', [
        'beforeAll: run once',
        'beforeAll: run once',
        'beforeEach: run twice',
        'beforeEach: run twice',
        'test: called skip once',
        'test: called skip once',
        'afterEach: run twice',
        'afterEach: run twice',
        'afterAll: run once',
        'afterAll: run once'
      ]);

      testPendingRunnables('test', [
        'beforeAll: run once',
        'beforeAll: run once',
        'beforeEach: run twice',
        'beforeEach: run twice',
        'test: called skip once',
        'test: called skip once',
        'afterEach: run twice',
        'afterEach: run twice',
        'afterAll: run once',
        'afterAll: run once'
      ], 'once');

      testPendingRunnables('afterEach', [
        'beforeAll: run once',
        'beforeAll: run once',
        'beforeEach: run once',
        'beforeEach: run once',
        'test: run once',
        'test: skipped',
        'afterEach: called skip once',
        'afterEach: called skip once',
        'afterAll: run once',
        'afterAll: run once'
      ], 'once');

      testPendingRunnables('afterAll', [
        'beforeAll: run once',
        'beforeAll: run once',
        'beforeEach: run twice',
        'beforeEach: run twice',
        'test: run once',
        'test: run once',
        'afterEach: run twice',
        'afterEach: run twice',
        'afterAll: called skip once',
        'afterAll: called skip once'
      ]);

      testPendingRunnables('afterAll', [
        'beforeAll: run once',
        'beforeAll: run once',
        'beforeEach: run twice',
        'beforeEach: run twice',
        'test: run once',
        'test: run once',
        'afterEach: run twice',
        'afterEach: run twice',
        'afterAll: called skip once',
        'afterAll: called skip once'
      ], 'once');
    });

  it('issue-2315: cannot read property currentRetry of undefined', function (done) {
    runJSON('regression/issue-2315.fixture.js', [], function (err, res) {
      assert(!err);
      assert.equal(res.stats.pending, 0);
      assert.equal(res.stats.passes, 0);
      assert.equal(res.stats.failures, 1);
      assert.equal(res.code, 1);
      done();
    });
  });

  it('issue-2406: should run nested describe.only suites', function (done) {
    this.timeout(2000);
    runJSON('regression/issue-2406.fixture.js', [], function (err, res) {
      assert(!err);
      assert.equal(res.stats.pending, 0);
      assert.equal(res.stats.passes, 2);
      assert.equal(res.stats.failures, 0);
      assert.equal(res.code, 0);
      done();
    });
  });

  it('issue-2417: should not recurse infinitely with .only suites nested within each other', function () {
    runJSON('regression/issue-2417.fixture.js', [], function (err, res) {
      assert(!err);
      assert.equal(res.stats.pending, 0);
      assert.equal(res.stats.passes, 1);
      assert.equal(res.stats.failures, 0);
      assert.equal(res.code, 0);
    });
  });

  it('issue-1417 uncaught exceptions from async specs', function (done) {
    runJSON('regression/issue-1417.fixture.js', [], function (err, res) {
      assert(!err);
      assert.equal(res.stats.pending, 0);
      assert.equal(res.stats.passes, 0);
      assert.equal(res.stats.failures, 2);

      assert.equal(res.failures[0].title,
        'fails exactly once when a global error is thrown synchronously and done errors');
      assert.equal(res.failures[0].err.message, 'sync error');
      assert.equal(res.failures[1].title,
        'fails exactly once when a global error is thrown synchronously and done completes');
      assert.equal(res.failures[1].err.message, 'sync error');
      assert.equal(res.code, 2);
      done();
    });
  });
});

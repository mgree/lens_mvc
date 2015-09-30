/**
 * @fileoverview
 * 
 * <p>Tests the lens bidirectional program combinators for JavaScript and
 * Flapjax.</p> 
 * <p>It adds a number of testing methods to the Lens prototype and updates the
 * lens implementations' prototypes to include these new testing methods.  (It
 * only updates registered lenses, so be careful!)</p>
 * <p>Tests may then be created with $T(test_name, thunk1, thunk2, ...) and run
 * with runTests.</p>
 * 
 * @author Michael Greenberg
 * @version 1
 */

function initTests() {

/******************************
 * {{{ TEST FRAMEWORK
 ******************************/

/**
 * The storage of all tests to run.
 */
var __tests = {};

/**
 * Cached div in which the totals are held.
 */
var totalDiv;

function scrub(s) {
    return s.replace(/(\s|\(|\)|,)/g, '_');
}

/**
 * Creates the structure for storing test results.
 */
function createTestInfo(test, count_id, time_id, failures_id, prose) {
    var container = document.createElement('div');
    container.setAttribute('id', scrub('test_' + test));
    container.setAttribute('class', 'test');
        
    var info = document.createElement('span');
    info.setAttribute('id', scrub('test_' + test + '_info'));
    info.setAttribute('class', 'test_info');        
    info.appendChild(document.createTextNode(
        prose || ('Testing ' + test)));
    
    var time = document.createElement('span');
    time.setAttribute('id', time_id);
    time.setAttribute('class', 'test_time');    
        
    var fails = document.createElement('span');
    fails.setAttribute('id', failures_id);
    fails.setAttribute('class', 'test_failures');
    
    span = document.createElement('span');
    span.setAttribute('id', count_id);
    span.setAttribute('class', 'test_result');
    span.setAttribute('style', "background-color: #0f0");
            
    span.appendChild(document.createTextNode('0'));
    span.appendChild(document.createTextNode('/'));
    span.appendChild(document.createTextNode('0'));
    
    container.appendChild(info);
    container.appendChild(time);
    container.appendChild(fails);
    container.appendChild(span);
        
    document.getElementById('tests').appendChild(container);
    return span;
}

/**
 * Updates a test count.
 */
function incrementTestCount(countSpan, success) {
    var succNode = countSpan.childNodes[0];
    var totalNode = countSpan.childNodes[2];

    var succ = parseInt(succNode.data, 10) + (success ? 1 : 0);
    var total = parseInt(totalNode.data, 10) + 1;
   
    succNode.data = succ.toString();
    totalNode.data = total.toString();

    if (succ < total) { countSpan.setAttribute('style', 
                                               "background-color: #f00"); }
}

/**
 * Writes the result of running a test to the DOM.
 */
function addTestResult(test, success, index) {
    totalDiv = totalDiv || createTestInfo('totals', 
                                          'test_tally',
                                          'test_total_time', 
                                          'test_fail_tally', 
                                          'Totalled results');
    
    var count_id = scrub('test_' + test + '_count');
    var time_id = scrub('test_' + test + '_time');
    var failures_id = scrub('test_' + test + '_failures');
    var span = document.getElementById(count_id) || 
        createTestInfo(test, count_id, time_id, failures_id);
    
    incrementTestCount(span, success);
    incrementTestCount(totalDiv, success);
    if (!success) {
        var fails = document.getElementById(failures_id);
        fails.appendChild(document.createTextNode((index + 1).toString() + 
                                                  ' '));
    }
}

/**
 * Writes the time taken running a series of tests to the DOM.
 */
function recordTestTime(test, ms) {
    var time_id = scrub('test_' + test + '_time');
    var span = document.getElementById(time_id);
    while (span.hasChildNodes()) { span.removeChild(span.firstChild); }
    
    var time = document.createTextNode(ms.toString() + ' ms');
    span.appendChild(time);
}

/**
 * Runs all tests in __tests.
 */
function runTests() {
    var old_error = set_error_handler(throw_on_error);
    
    var total_start = new Date().getTime();
    for (var test_name in __tests) {
        var tests = __tests[test_name];           

        var start = new Date().getTime();    
        for (var i = 0;i < tests.length;i++) {
            var success = false;
            try { success = tests[i](); }
            catch (e) {
                if (console !== undefined) { 
                    console.error('%o', e);
                } else { 
                    throw e; 
                }
            }
            addTestResult(test_name, success, i);
        }
        var finish = new Date().getTime(); 
        var time = finish - start;
        recordTestTime(test_name, time);        
    }
    var total_finish = new Date().getTime();
    var total_time = total_finish - total_start;
    recordTestTime('total', total_time);
    
    set_error_handler(old_error);
}

/**
 * Adds a set of tests for a given name, e.g.
 * 
 * $T(foo, function () { ... }, function () { ... }, ...)
 * 
 * @param {String} test_name The name of the test
 * @param {thunk} arguments Tests to add
 */
function $T(test_name) {
    var tests = __tests[test_name] || [];
    
    for (var i = 1;i < arguments.length;i++) {
        tests.push(arguments[i]);
    }            
    
    __tests[test_name] = tests;
}                          

// TEST FRAMEWORK }}}

/******************************
 * {{{ LENS TEST FUNCTIONS
 ******************************/
 
/**
 * Tests the getput law:
 * 
 * For all c in C and a in A, put(get(c), a) = c
 * 
 * @param cval The value to put through the lens
 * @return {thunk} A test for the getput law on the lens with the given value
 */
Lens.prototype.getput = function (cval) {
    var lens = this;
    return function () {
      var got = lens.get(cval);
      var put = lens.putback(got, cval);
      return equal(cval, put);
    };
};

/**
 * Tests the putget law:
 * 
 * For all c in C and a in A, get(putback(a, c)) = a
 * 
 * @param aval The value in A to put through the lens
 * @param cval The value in C to put through the lens
 * @return {thunk} A test for the putget law on the lens with the given value
 */
Lens.prototype.putget = function (aval, cval) {
    var lens = this;
    return function () {
        var put = lens.putback(aval, cval);
        var got = lens.get(put);
        return equal(aval, got);
    };
};

/**
 * Tests the putput pseudo-law, which is not true of all lenses:
 * 
 * For all c in C and a1, a2 in A, putback(a2, putback(a1, c)) = putback(a2, c)
 * 
 * @param aval1 The first value in A to put through the lens
 * @param aval2 The second value in A
 * @param cval The value in C
 * @return {thunk} A test for the putput law on the lens with the given value
 */
Lens.prototype.putput = function (aval1, aval2, cval) {
    var lens = this;
    return function() {
        var put1 = lens.putback(aval1, cval);
        var put2 = lens.putback(aval2, put1);
        var skipPut = lens.putback(aval2, cval);
        return equal(put2, skipPut);
    };
};

/**
 * Tests that the get of a lens is equal to some value.
 * 
 * @param cval The value in C to put through
 * @param val The expected value of lens.get(cval) (in A)
 * @return {thunk} A test for lens.get(cval) == val
 */
Lens.prototype.get_is = function (cval, val) {
    var lens = this;
    return function () { 
        var got = lens.get(cval);
        return equal(got, val);
    };
};

/**
 * Tests that the putback of a lens is equal to some value.
 * 
 * @param aval The value in A to put through
 * @param cval The value in C
 * @param val The expected value of lens.putback(aval, cval) (in C)
 * @return {thunk} A test for lens.putback(aval, cval) == val
 */
Lens.prototype.putback_is = function (aval, cval, val) {
    var lens = this;

    return function () {
        var put = lens.putback(aval, cval);
        return equal(put, val);
    };
};

/**
 * Tests that running f throws a value that satisfies e_pred.
 *
 * @param {function} f The function to run
 * @param {function} e_pred A predicate matching the desired exception
 * @return {thunk} A test for whether f throws what is desired
 */
function throws_e(f, e_pred) {
    return function () {
        try { f(); } 
        catch (e) { return e_pred(e); }
        return false;
    };
}

/**
 * Tests that get of a lens throws a specific error.
 *
 * @param cval The value to get (in C)
 * @param e_pred {function} A predicate matching the desired exception
 * @return {thunk} A test for lens.get(cval) throws an e_pred
 */ 
Lens.prototype.get_throws = function (cval, e_pred) {
    var lens = this;
    return throws_e(function () { lens.get(cval); }, e_pred);    
};

/**
 * Tests that putback of a lens throws a specific error.
 *
 * @param aval The abstract tree to putback (in A)
 * @param cval The concrete tree to putback (in C)
 * @param {function} e_pred A predicate matching the desired exception
 * @return {thunk} A test for lens.putback(aval, cval) throws an e_pred
 */
Lens.prototype.putback_throws = function (aval, cval, e_pred) {
    var lens = this;
    return throws_e(function () { lens.putback(aval, cval); }, e_pred); 
};

/**
 * Runs a series of bind/unbind calls on an outer lens and an inner lens; it
 * checks to make sure that the inner lens has the same value as the outer lens.
 *
 * @param {Lens} outer The outer lens
 * @param {Lens} inner The inner lens, a sub-lens of outer
 * @return {thunk} A test for changes to bindings
 */
function test_bindings(outer, inner) {
    return function () {
        if (!equal(outer.bindings, [])) { return false; }
        if (!equal(outer.bindings, inner.bindings)) { return false; }
        
        outer.bind('foo');
        if (!equal(outer.bindings, ['foo'])) { return false; }
        if (!equal(outer.bindings, inner.bindings)) { return false; }
        
        outer.bind('bar');
        if (!equal(outer.bindings, ['foo', 'bar'])) { return false; }
        if (!equal(outer.bindings, inner.bindings)) { return false; }

        outer.unbind('foo');
        if (!equal(outer.bindings, ['bar'])) { return false; }
        if (!equal(outer.bindings, inner.bindings)) { return false; }
        
        outer.bind('foo');
        if (!equal(outer.bindings, ['bar', 'foo'])) { return false; }
        if (!equal(outer.bindings, inner.bindings)) { return false; }
        
        outer.unbind('bar');
        if (!equal(outer.bindings, ['foo'])) { return false; }
        if (!equal(outer.bindings, inner.bindings)) { return false; }
        
        outer.unbind('foo');
        if (!equal(outer.bindings, [])) { return false; }
        if (!equal(outer.bindings, inner.bindings)) { return false; }
        
        return true;
    };
};


// LENS TEST FUNCTIONS }}}

/******************************
 * {{{ TESTS
 ******************************/

// {{{ BASIC LENSES

/* Tests for LId */
(function () {
    var id = id_lens();
    
    $T('the id_lens lens',
        id.getput(5),
        id.getput(undefined),
        id.getput({ 'this-is-a': 'tree' }),
        id.getput(['this', 'is', 'a', 'list']),
        id.putget(5, 5),
        id.putget(undefined, 5),
        id.putget(['a', 'b', 'c'], undefined),
        id.putput(1, 2, 3),
        id.get_is(5, 5),
        id.putback_is(5, undefined, 5)
        );
})();

/* Tests for LError */
(function () {
    var err = error_lens('test', 'this was a test');
    var err_exception = function (dir) {
                            return function (e) {
                                return e.name == 'LensException' &&
                                       e.lens == 'test' &&
                                       e.msg == dir + ': this was a test'; 
                            };
                        };
                                                
    $T('the error_lens lens',
       err.get_throws(undefined, err_exception('GET')),
       err.putback_throws(undefined, undefined, err_exception('PUTBACK')),
       err.get_throws({}, err_exception('GET')),
       err.putback_throws({}, {}, err_exception('PUTBACK')),
       err.get_throws(5, err_exception('GET')),
       err.putback_throws(10, 10, err_exception('PUTBACK')));
})();

/* Tests for LConst */
(function () {
    var v = 5;
    var d = 10;
    var c = constant(v, d);
    
    $T('the constant lens',
       c.getput(7),
       c.getput(10),
       c.getput(undefined),
       c.putget(v, 7),
       c.putget(v, 10), 
       c.putget(v, 5),
       c.putget(v, undefined),
       c.get_is(7, v),
       c.get_is(undefined, v),
       c.putback_is(v, undefined, d),
       c.putback_is(v, 5, 5),
       c.putback_is(v, 7, 7),
       c.putback_throws(v+1, 7, function (e) {
           return e.name == 'LensException' &&
                  e.lens == c.name;
       }));
})();

// BASIC LENSES }}}

// {{{ ARITHMETIC LENSES

/* Tests for LPlus */
(function () {
    var p = plus(1, 0);
    
    $T('the plus lens',
       p.getput(0),
       p.getput(1),
       p.putget(5, 0),
       p.putget(0, 0),
       p.get_is(0, 1),
       p.get_is(-10, -9),
       p.putback_is(undefined, undefined, 0),
       p.putback_is(15, undefined, 14));
})();

/* Tests for LMinus */
(function () {
    var m = minus(1, 0);
    
    $T('the minus lens',
       m.getput(0),
       m.getput(1),
       m.putget(5, 0),
       m.putget(0, 0),
       m.get_is(0, -1),
       m.get_is(-10, -11),
       m.putback_is(undefined, undefined, 0),
       m.putback_is(15, undefined, 16));
})();

/* Tests for LTimes */
(function () {
    var t = times(5, 1);
    
    $T('the times lens',
       throws_e(function () { var bad_times = times(0, undefined); },
                function (e) { return e.name == 'LensException' &&
                                      e.lens == t.name; }),
       t.getput(0),
       t.getput(1),
       t.putget(5, 0),
       t.putget(15, 3),
       t.get_is(0, 0),
       t.get_is(-10, -50),
       t.putback_is(undefined, undefined, 1),
       t.putback_is(15, undefined, 3));
})();

/* Tests for LDivide */
(function () {
    var d = divide(5, 1);
    
    $T('the divide lens',
       throws_e(function () { var bad_divide = divide(0, undefined); },
                function (e) { return e.name == 'LensException' &&
                                      e.lens == d.name; }),
       d.getput(0),
       d.getput(20),
       d.putget(5, 0),
       d.putget(-15, 0),
       d.get_is(0, 0),
       d.get_is(-10, -2),
       d.putback_is(undefined, undefined, 1),
       d.putback_is(15, undefined, 75));
})();

// ARITHMETIC LENSES }}}

// {{{ OBJECT LENSES

/* Tests for LHoist and LPlunge */
(function () {
    var h = hoist('foo');
    var strict_h = hoist('foo', true);

    var p = plunge('foo');
    var strict_p = plunge('foo', true);    
    
    var o = { foo: 5 };
    
    function is_hoist_exception(e) {
        return e.name == 'LensException' && e.lens == h.name;
    }    
    
    function is_plunge_exception(e) {
        return e.name == 'LensException' && e.lens == p.name;
    }    
    
    $T('the hoist lens',
       h.getput(o),
       h.putget(5, o),
       h.putget(undefined, o),
       h.putget(o, undefined),
       h.get_is(o, 5),
       h.putback_is(5, o, { foo: 5 }),
       h.get_is({}, undefined),
       h.get_throws(5, is_hoist_exception));
       
    // run through each strict test       
    var strict_errors = { empty: {},
                          no_foo: { bar: 6 },
                          too_much: { foo: 5, bar: 6 } };   
    for (var ex in strict_errors) {
         $T('the strict hoist lens',
            strict_h.get_throws(strict_errors[ex], is_hoist_exception));                     
    }
    
    $T('the plunge lens',
       p.getput(undefined),
       p.getput(5),
       p.getput({ bar: 5 }),
       p.putget(o, undefined),
       p.putget(o, 5),
       p.putget(o, 7),
       p.get_is(undefined, { foo: undefined }),
       p.get_is(5, { foo: 5 }),
       p.putback_is({ foo: 5 }, 5),
//       p.putback_throws(undefined, undefined, is_plunge_exception),
       p.putback_throws(5, undefined, is_plunge_exception));
       
    for (ex in strict_errors) {
         $T('the strict plunge lens',
            strict_p.putback_throws(strict_errors[ex], undefined, is_plunge_exception));                     
    }
})();

/* Test for LXfork */
(function () {
	var os = { 'undef': undefined, 
	           'empty': {}, 
	           'foo': { foo: 5 }, 
	           'foobar': { foo: 5, bar: 6 }
	         };

	// simple tests with an identity xfork
	var true_pred = function () { return true; };
	var id = id_lens();
	var xf = xfork(true_pred, true_pred, id, id);
	for (var ex in os) {
		var o = os[ex];
		$T('the xfork lens (identity)',
		   xf.getput(o),
		   xf.putget(o, undefined),
		   xf.putget(undefined, o),
		   xf.putget(o, o),
		   xf.get_is(o, o),
		   xf.putback_is(undefined, o, o),
		   xf.putback_is(o, undefined, o),			
		   xf.putback_is(o, o, o));
	}
	
	// simple predicates, identity lenses
	var foo_pred = function (p) { return p == 'foo'; };
	xf = xfork(foo_pred, foo_pred, id, id);
	for (ex in os) {
		o = os[ex];
		$T('the xfork lens (simple predicates, identity lenses)',
		   xf.getput(o),
		   xf.putget(o, undefined),
		   xf.putget(undefined, o),
		   xf.putget(o, o),
		   xf.get_is(o, o),
		   xf.putback_is(undefined, o, o),
		   xf.putback_is(o, undefined, o),			
		   xf.putback_is(o, o, o));
	}
	
	// simple predicates, complex sublenses
	xf = xfork(foo_pred, foo_pred, id, constant({}, {}));
	for (ex in os) {
		o = os[ex];
		$T('the xfork lens (simple predicates, complex lenses)',
		   xf.getput(o),
		   xf.putget(undefined, o, o));
	}
	$T('the xfork lens (simple predicates, complex lenses)',
	   xf.get_is({}, {}),
	   xf.get_is(os.foo, os.foo),
	   xf.get_is(os.foobar, os.foo),
	   xf.putback_is(os.foo, os.foo, os.foo),
	   xf.putback_is(os.foo, os.foobar, os.foobar),
	   xf.putback_is({ foo: 7 }, { foo: 5, bar: 6 }, { foo: 7, bar: 6 }),
       test_bindings(xf, id));
})();

/* Tests for LFork */
(function () {
	var f = fork(function (p) { return p == 'foo'; },
		  		 id_lens(), plunge('dongle'));					 
	var o = { foo: 5, bar: 6, baz: 7 };
	var get = { foo: 5, dongle: { bar: 6, baz: 7 } };
	
	$T('the fork lens',
	   f.getput(undefined),
	   f.putget({ dongle: {} }, undefined),
	   f.getput(o),
	   f.putget(get, o),
	   f.get_is(o, get),
	   f.putback_is(get, o, o));
})();

/* Tests for LFilter */
(function () {
	var f = filter(function (p) { return p == 'name'; }, {});
	var o = { name: 'Pat', phone: '333-4444' };
	
	$T('the filter lens',
	   f.getput(undefined),
	   f.getput({}),
	   f.putget(undefined, undefined),
	   f.putget(undefined, {}),
	   f.putget({}, {}),
	   f.getput({ foo: 5 }),
	   f.get_is({ foo: 5 }, {}),
	   f.putget({}, { foo: 5 }),
	   f.putback_is({}, { foo: 5 }, { foo: 5 }),
	   
	   // taken from Combinators for Bi-Directional Tree Transformations, p.17
	   f.getput(o),
	   f.putget({ name: 'Pat' }, o),
	   f.putget({ name: 'Patty' }, o),
	   f.putback_is({ name: 'Patty' }, o, { name: 'Patty', phone: '333-4444' }));
})();

/* Tests for LPrune */
(function () {
	var p = prune('foo', 5);
	
	$T('the prune lens',
	   p.getput(undefined),
	   p.putget(undefined, undefined),
	   p.putback_is({}, undefined, { foo : 5 }),
	   p.getput({ bar : 6 }),
	   p.getput({ foo : 5 }),
	   p.getput({ foo : 6 }),
	   p.putget({ bar : 5 }, { bar : 5, foo : 6 }),
	   p.get_is({ foo : 6 }, {}),
	   p.get_is({ bar : 5, foo : 6 }, { bar : 5 }),
	   p.putback_is({ bar : 5 }, {}, { bar : 5 }),
	   p.putback_is({ bar : 5 }, { foo : 6 }, { bar : 5, foo : 6 }));
})();

/* Tests for LAdd */
(function () {
    // taken from Combinators for Bi-Directional Tree Transformations, p.18
	var al = add('b', { 'x': {} });
	var c = { 'a': {} };
	var a = { 'a': {}, 'b': { 'x': {} } };
	
	$T('the add lens',
	   al.getput(undefined),
	   al.putget({ b: { x: {} } }, undefined),
	   al.getput(c),
	   al.putget(a, c),
	   al.get_is({}, { b: { x: {} } }),
	   al.get_is(c, a),
	   al.putback_is({ c: {}, b: { x: {} } }, c, { c: {} }),
	   al.putback_is({ c: 5, a: 10, b: { x: {} } }, c, { c: 5, a: 10 }));
})();

/* Tests for LFocus */
(function () {
    var f = focus('foo', 5);
    var foo = { 'foo': 7 };
    var foobar = { 'foo': 7, 'bar': 12 };    
    
    $T('the focus lens',
       f.getput(foo),
       f.putget(0, foo),
       f.putget(undefined, foo),
       f.putget({ wrong: 'type' }, foo),
       f.get_is(foo, 7),
       f.get_is(foobar, 7),
       f.putback_is(7, foo, foo),
       f.putback_is(12, foo, { foo: '12' }),
       f.putback_is({ wrong: 'type' }, foo, { foo: { wrong: 'type' } }),
       f.putback_is(7, foobar, foobar),
       f.putback_is(0, foobar, { foo: 0, bar: 12 }),
       f.getput({foo : 6, bar: 5, baz: { foo: 9 } }),
       f.putget(11, {foo : 6, bar: 5, baz: { foo: 9 } }));
})();

/* Tests for LHoistNonunique */
(function () {
    var hoist = hoist_nonunique('foo',
                                function (fp) {
                                    return fp == 'bar';
                                });
    $T('the hoist_nonunique lens',
       hoist.getput(undefined),
       hoist.putget(undefined, undefined),
       hoist.getput({ foo: {} }),
       hoist.putget({}, undefined),
       hoist.putget({}, {}),
       hoist.putget({}, { foo: {} }),
       hoist.get_is({ foo: { bar: 5 } }, { bar : 5 }),
       hoist.putback_is({ bar: 7 }, undefined, { foo: { bar: 7 } }),
       hoist.putback_is({ baz: 6, bar: 7 }, undefined, { baz: 6, foo: { bar: 7 } }),
       hoist.putback_is({ baz: 12 }, {}, { baz: 12, foo: {} })); 
})();

/* Tests for LRename */
(function () {
    var ren = rename('foo', 'bar');
    var foo = { 'foo': 5 };
    var bar = { 'bar': 5 };
    var foobaz = { 'foo': 5, 'baz': 6 };
    var barbaz = { 'bar': 5, 'baz': 6 };

    $T('the rename lens',
       ren.getput(undefined),
       ren.putget({ bar: undefined }, undefined),
       ren.getput(foo),
       ren.putget(bar, undefined),
       ren.putget(bar, {}),
       ren.putget(bar, foo),
       ren.putget(bar, foobaz),
       ren.putget(barbaz, undefined),
       ren.putget(barbaz, {}),
       ren.putget(barbaz, foo),
       ren.putget(barbaz, foobaz),
       ren.get_is(foo, bar),
       ren.get_is(foobaz, barbaz),
       ren.putback_is(bar, undefined, foo),
       ren.putback_is(bar, {}, foo),
       ren.putback_is(bar, foo, foo),
       ren.putback_is(bar, foobaz, foo),
       ren.putback_is(barbaz, undefined, foobaz),
       ren.putback_is(barbaz, {}, foobaz),
       ren.putback_is(barbaz, foo, foobaz),
       ren.putback_is(barbaz, foobaz, foobaz));
})();

/* Tests for LMap */
(function () {
    var add5 = plus(5, undefined);
    var m = map(add5);
    var o = { foo: 5, bar: 6 };
    
    $T('the map lens',
       m.getput({}),
       m.putget({}, undefined),
       m.putget({}, {}),
       m.get_is({}, {}),
       m.putback_is({}, undefined, {}),
       m.putback_is({}, {}, {}),
       m.getput(o),
       m.putget(o, undefined),
       m.putget(o, {}),
       m.putget(o, o),
       m.get_is(o, { foo: 10, bar: 11 }),
       m.putback_is(o, o, { foo: 0, bar: 1 }),
       m.putback_is({ foo: undefined }, {}, { foo: undefined }),
       test_bindings(m, add5));
       
    var cs = { undef: undefined,
               empty: {},
               o: o };
    for (var ex in cs) {
        $T('the map lens', m.putback_is({ foo: 10, bar: 11 }, cs[ex], o));
    }   
})();

/* Tests for LWmap */
(function () {
    var add5 = plus(5, undefined);
    var wm = wmap(['foo', 'bar'], add5);
    var foobar = { foo: 5, bar: 6 };
    var foobarbaz = { foo: 5, bar: 6, baz: 7 };    
    
    $T('the wmap lens (as map)',
       wm.getput({}),
       wm.get_is({}, {}),
       wm.get_is(foobar, { foo: 10, bar: 11 }),
       wm.getput(foobarbaz),
       wm.get_is(foobarbaz, { foo: 10, bar: 11, baz: 7 }),
       test_bindings(wm, add5));
    var cs = { undef: undefined,
               empty: {},
               foobar: foobar,
               foobarbaz: foobarbaz };
    for (var ex in cs) {
        var c = cs[ex];
        $T('the wmap lens (as map)',
           wm.putget({}, c),
           wm.putback_is({}, c, {}),
           wm.putget(foobar, c),
           wm.putback_is(foobar, c, { foo: 0, bar: 1 }),
           wm.putget(foobarbaz, c),
           wm.putback_is(foobarbaz, c, { foo: 0, bar: 1, baz: 7}));
    }
    
    var sub5 = minus(5, undefined);
    wm = wmap('foo', add5, 
              'bar', sub5);
    $T('the wmap lens (different lenses)',
       wm.getput({}),
       wm.get_is({}, {}),
       wm.getput(foobar),
       wm.getput(foobarbaz),
       wm.get_is(foobar, { foo: 10, bar: 1 }),
       wm.get_is(foobarbaz, { foo: 10, bar: 1, baz: 7 }),
       test_bindings(wm, add5),
       test_bindings(wm, sub5));
     
     for (ex in cs) {
        c = cs[ex];
        $T('the wmap lens (different lenses)',
           wm.putget({}, c),
           wm.putback_is({}, c, {}),
           wm.putget(foobar, c),
           wm.putback_is(foobar, c, { foo: 0, bar: 11 }),
           wm.putget(foobarbaz, c),
           wm.putback_is(foobarbaz, c, { foo: 0, bar: 11, baz: 7}));
    }
    
    function wmap_exception(e) { return e.name == 'LensException' &&
                                        e.lens == 'wmap'; }
    wm = wmap('foo', add5,
              'bar', id_lens(),
              false);
    $T('the wmap lens (no default lens)',
       wm.getput({}),
       wm.get_is({}, {}),
       wm.getput(foobar),
       wm.get_is(foobar, { foo: 10, bar: 6 }),
       wm.get_throws(foobarbaz, wmap_exception));
     
     for (ex in cs) {
        c = cs[ex];
        $T('the wmap lens (no default lens)',
           wm.putget({}, c),
           wm.putback_is({}, c, {}),
           wm.putget(foobar, c),
           wm.putback_is(foobar, c, { foo: 0, bar: 6 }),
           wm.putback_throws(foobarbaz, c, wmap_exception));
    }
})();

/* Tests for LCopy */
(function () {
    var cp = copy('foo', 'bar');
    var foo = { foo: 5 };
    var foobar = { foo: 5, bar: 5 };    
    
    $T('the copy lens',
       cp.getput({}),
       cp.putget({}, undefined),
       cp.putget({}, {}),
       cp.putget({}, foo),
       cp.putget(foobar, undefined),
       cp.putget(foobar, {}),
       cp.putget(foobar, foo),
       cp.getput(foo),
       cp.get_is(foo, foobar),
       cp.putback_is(foobar, undefined, foo));
})();

/* Tests for LMerge */
(function () {
    var m = merge('foo', 'bar');
    var foo = { foo: 5 };
    var foobar = { foo: 5, bar: 5 };
    
    $T('the merge lens',
       m.getput(undefined),
       m.putget(undefined, undefined),
       m.putget(undefined, {}),
       m.putget(undefined, foo),
       m.putget(undefined, foobar),
       m.getput(foobar),
       m.putget(foo, undefined),
       m.putget(foo, {}),
       m.putget(foo, foo),
       m.putget(foo, foobar),
       m.get_is(foobar, foo),
       m.putback_is(foo, undefined, foobar),
       m.putback_is(foo, {}, foobar),
       m.putback_is(foo, foo, foobar),
       m.putback_is(foo, { foo: 5, bar: 6 }, { foo: 5, bar: 6 }));
})();

// OBJECT LENSES }}}

// {{{ CONDITIONAL LENSES

/* Tests for LCcond */
(function () {
	var add5 = plus(5, 0);
	var c = ccond(function (c) { return typeof c == 'object'; },
	              focus('foo', 0).seq(add5),
	              add5);
	var foo = { foo: 0 };
	
	$T('the ccond lens (incl. bindings for seq and non-double bindings)',
	   c.getput(0),
	   c.putget(5, 0),
	   c.get_is(0, 5),
	   c.putback_is(6, 0, 1),
	   c.getput(foo),
	   c.putget(5, foo),
	   c.get_is(foo, 5),
	   c.putback_is(6, foo, { foo: 1 }),
       // here we'll test not only that ccond's recursive calls work, but that
       // seq passes the information along correctly.  since add5 is on both
       // branches of the ccond, we'll also test to make sure that there double
       // binds/unbinds don't hurt anything
       test_bindings(c, add5));
})();

/* Tests for LAcond/LRenameIfPresent */
(function () {
	var rename = rename_if_present('foo', 'bar');
	var foo = { foo: 5 };
	var bar = { bar: 5 };	
	var baz = { baz: 5 };	
	
	$T('the acond lens (via the rename_if_present lens)',
	   rename.getput(undefined),
	   rename.putget(undefined, undefined),
	   rename.getput({}),
	   rename.putget({}, undefined),
	   rename.putget({}, {}),
	   rename.getput(foo),
	   rename.get_is(foo, bar),
	   rename.getput(baz),
	   rename.get_is(baz, baz),
	   rename.putget(bar, {}),
	   rename.putget(bar, foo),
	   rename.putget(bar, baz),
	   rename.putback_is({ bar: 7 }, foo, { foo: 7 }),
	   rename.putback_is({ bar: 3, baz: 5 }, baz, { foo: 3, baz: 5 }));
})();

/* Tests for LCond */
(function () {
	var add5 = plus(5, 0);
	var always_true = function () { return true; };
	var always_undefined = function () { return undefined; };
	var c = cond(function (c) { return typeof c == 'object'; },
	             always_true, always_true,
	             always_undefined, always_undefined,
	             focus('foo', 0).seq(add5),
	             add5);
	var foo = { foo: 0 };
	
	$T('the cond lens (as ccond)',
	   c.getput(0),
	   c.putget(5, 0),
	   c.get_is(0, 5),
	   c.putback_is(6, 0, 1),
	   c.getput(foo),
	   c.putget(5, foo),
	   c.get_is(foo, 5),
	   c.putback_is(6, foo, { foo: 1 }),
       test_bindings(c, add5));

	var has_bar = function (a) { return has_prop(a, 'bar'); };
	var no_bar = function (a) { return !has_prop(a, 'bar'); };
	c = cond(function (c) { return has_prop(c, 'foo'); },
	         has_bar, no_bar,
	         always_undefined, always_undefined,
	         rename('foo', 'bar'),
	         id_lens());
	foo = { foo: 5 };
	var bar = { bar: 5 };
	var baz = { baz: 5 };
	
	$T('the cond lens (as acond/rename_if_present)',
	   c.getput(undefined),
	   c.putget(undefined, undefined),
	   c.getput({}),
	   c.putget({}, undefined),
	   c.putget({}, {}),
	   c.getput(foo),
	   c.get_is(foo, bar),
	   c.getput(baz),
	   c.get_is(baz, baz),
	   c.putget(bar, {}),
	   c.putget(bar, foo),
	   c.putget(bar, baz),
	   c.putback_is({ bar: 7 }, foo, { foo: 7 }),
	   c.putback_is({ bar: 3, baz: 5 }, baz, { foo: 3, baz: 5 }));
})();

// OBJECT LENSES }}}

// {{{ LIST LENSES

/* Tests for LHead */
(function () {
	var hd = head([]);
	var arr = [1, 2, 3, 4];
	
	$T('the head lens',
	   hd.getput([]),
	   hd.getput(arr),
	   hd.putget(5, []),
	   hd.putget(5, arr),
	   hd.get_is([], undefined),
	   hd.get_is(arr, 1),
	   hd.putback_is(5, [], [5]),
	   hd.putback_is(5, arr, [5, 2, 3, 4]));
})();

/* Tests for LTail */
(function () {
	var tl = tail([]);
	var arr = [1, 2, 3, 4];
	
	$T('the tail lens',
	   tl.getput([]),
	   tl.getput(arr),
	   tl.putget(5, []),
	   tl.putget(5, arr),
	   tl.get_is([], undefined),
	   tl.get_is(arr, 4),
	   tl.putback_is(5, [], [5]),
	   tl.putback_is(5, arr, [1, 2, 3, 5]));
})();

/* Tests for LIndex */
(function () {
	var idx = index(2, [1, 2, 3, 4]);
	
	$T('the index lens',
	   idx.getput(undefined),
	   idx.getput([]),
	   idx.getput([1]),
	   idx.getput(['foo', 'bar', 'baz']),
	   idx.getput([1, 2, 3, 4, 5, 6]),
	   idx.get_is(['foo', 'bar', 'baz'], 'baz'),
	   idx.putget('foo', undefined),
	   idx.putget('foo', []),
	   idx.putget('foo', ['a']),
	   idx.putget('foo', [1, 2, 3, 4, 5]),
	   idx.putback_is('foo', ['bar', 'baz', 'quux', 'zort'], 
	                    ['bar', 'baz', 'foo', 'zort'])); 
})();

/* Tests for LLength */
(function () {
	var len = list_length();
	var arr = [1, 2, 3];	
	
	$T('the length lens',
	   len.getput([]),
	   len.getput(arr),
	   len.putget(0, arr),
	   len.putget(1, arr),
	   len.putget(2, arr),
	   len.putget(3, arr),
	   len.putget(4, arr),
	   len.get_is([], 0),
	   len.get_is(arr, 3),
	   len.putback_is(0, arr, []),
	   len.putback_is(1, arr, [1]),
	   len.putback_is(2, arr, [1, 2]),
	   len.putback_is(3, arr, arr),
	   len.putback_is(4, arr, [1, 2, 3, undefined]));
	   
	len = list_length('beginning', 'end', 0);
	$T('the length lens',
	   len.getput([]),
	   len.getput(arr),
	   len.putget(0, arr),
	   len.putget(1, arr),
	   len.putget(2, arr),
	   len.putget(3, arr),
	   len.putget(4, arr),
	   len.get_is([], 0),
	   len.get_is(arr, 3),
	   len.putback_is(0, arr, []),
	   len.putback_is(1, arr, [3]),
	   len.putback_is(2, arr, [2, 3]),
	   len.putback_is(3, arr, arr),
	   len.putback_is(4, arr, [1, 2, 3, 0]));
})();

/* Tests for LOrder */
(function () {
    var ord = order('foo', 'bar', 'baz');
    var o = { foo: 5, bar: 6, baz: 7 };
    var arr = [5, 6, 7];
    
    var order_e = function (e) {
        return e.name == 'LensException' &&
               e.lens == 'order';
    };
    
    $T('the order lens',
       ord.getput(o),
       ord.get_is(o, arr),
       ord.putget(arr, undefined, o),
       ord.putget(arr, {}, o),
       ord.putget(arr, o, o),
       ord.putback_is(arr, o, o),
       ord.putback_throws([], o, order_e),
       ord.putback_throws([5, 6, 7, 8], o, order_e));
})();

/* Tests for LListMap */
(function () {
    var add5 = plus(5, undefined);
    var map = list_map(add5);
    var arr = [5, 6];
    
    $T('the list_map lens (no edits)',
       map.getput([]),
       map.putget([], undefined),
       map.putget([], []),
       map.get_is([], []),
       map.putback_is([], undefined, []),
       map.putback_is([], [], []),
       map.getput(arr),
       map.putget(arr, undefined),
       map.putget(arr, []),
       map.putget(arr, arr),
       map.get_is(arr, [10, 11]),
       map.putback_is(arr, arr, [0, 1]),
       map.putback_is([undefined], [], [undefined]),
       map.putback_is([undefined, 7, 8], [], [undefined, 2, 3]),
       // closure so we don't capture an outdated sublens
       function () {
           // we need a get to have an active list...
           map.get([5]);
           return test_bindings(map, map.lens_for_index(0))();
       });
       
    var cs = { undef: undefined,
               empty: [],
               o: arr };
    for (var ex in cs) {
        $T('the list_map lens (no edits)', map.putback_is([10, 11], cs[ex], arr));
    }
})();

/* Tests for LListMap with edits */
(function () {
    // this is a simple case, since add5 is essentially oblivious
    var add5 = plus(5, undefined);
    var map = list_map(add5);
    var arr = [5, 6];
    
    $T('the list_map lens (with edits)',
       map.getput([]),
       map.putget([], undefined),
       map.putget([], []),
       map.get_is([], []),
       map.putback_is([], undefined, []),
       map.putback_is([], [], []),
       map.getput(arr),
       map.putget(arr, undefined),
       map.putget(arr, []),
       map.putget(arr, arr),
       map.get_is(arr, [10, 11]),
       map.putback_is(arr, arr, [0, 1]),
       map.putback_is([undefined], [], [undefined]),
       map.putback_is([undefined, 7, 8], [], [undefined, 2, 3]),
       // closure so we don't capture an outdated sublens
       function () {
           // we need a get to have an active list, due to state cloning
           map.get([5]);
           return test_bindings(map, map.lens_for_index(0))();
       },
       function () {
           map.add_child(1)(6);
           return true;
       },
       map.putback_is([10, 12], [5, 7], [5, 6, 7]),
       map.get_is([5, 6, 7], [10, 11, 12]),
       function () {
           map.del_child(1)();
           return true;
       },
       map.putback_is([10, 11, 12], [5, 6, 7], [5, 7]),
       map.get_is([5, 7], [10, 12]));
    
    var cs = { undef: undefined,
               empty: [],
               o: arr };
    for (var ex in cs) {
        $T('the list_map lens (with edits)', map.putback_is([10, 11], cs[ex], 
                                                            arr));
    }
    
    var cmap = list_map(focus('foo'));
    var fooarr = [{ foo: 5 }, { foo: 6 }];
    
    $T('the list_map lens (with edits #2)',
       cmap.get_is(fooarr, arr),
       cmap.putback_is(arr, fooarr, fooarr),
       cmap.getput(fooarr),
       cmap.putget(arr, fooarr),
       function () {
           cmap.add_child(1)({ foo: 7 });
           return true;
       },
       cmap.putback_is([5, 6], fooarr, [{ foo: 5 }, { foo: 7 }, { foo: 6 }]),
       function () {
           cmap.add_child(1)({ foo: 7, bar: 0 });
           return true;
       },
       cmap.putback_is([5, 6], 
                       [{ foo: 5 }, { foo: 6, bar: 2 }], 
                       [{ foo: 5 }, { foo: 7, bar: 0 }, { foo: 6, bar: 2 }]),
       function () {
           cmap.del_child(1)();
           return true;
       },
       cmap.putback_is([5, 6, 9],
                       [{ foo: 5, bar: 0 }, { foo: 6, bar: 1 }, 
                        { foo:7, bar: 2 }],
                       [{ foo: 5, bar: 0 }, { foo: 9, bar: 2 }]));
})();

/* Tests for LRotate */
(function () {
	var rot = rotate();
	var arr = [1, 2, 3];	
	
	$T('the rotate lens',
	   rot.getput([]),
	   rot.getput(arr),
	   rot.putget([], undefined),
	   rot.putget([], []),
	   rot.putget([], arr),
	   rot.putget(arr, undefined),
	   rot.putget(arr, []),
	   rot.putget(arr, arr),
	   rot.get_is([], []),
	   rot.get_is(arr, [2, 3, 1]),
	   rot.putback_is([], undefined, []),
	   rot.putback_is(arr, [], [3, 1, 2]));
})();

/* Tests for LReverse */
(function () {
	var rev = reverse();
	var arr = [1, 2, 3];
	
	$T('the reverse lens',
	   rev.getput([]),
	   rev.getput(arr),
	   rev.putget([], undefined),
	   rev.putget([], []),
	   rev.putget([], arr),
	   rev.putget(arr, undefined),
	   rev.putget(arr, []),
	   rev.putget(arr, arr),
	   rev.get_is(arr, [3, 2, 1]),
	   rev.putback_is(arr, [], [3, 2, 1]),
	   rev.putback_is([3, 2, 1], arr, arr));
})();

/* Tests for LGroup */
(function () {
	var grp = group(2);
	var arre = [1, 2, 3, 4]; // even
	var arro = [1, 2, 3, 4, 5]; // ood
	
	$T('the group lens',
	   grp.getput([]),
	   grp.putget([], undefined),
	   grp.putget([], []),
	   grp.putget([], arre),
	   grp.putget([], arro),
	   grp.getput(arre),
	   grp.getput(arro),
	   grp.putget([[1, 2], [3, 4]], []),
	   grp.putget([[1, 2], [3, 4], [5]], []),
	   grp.get_is(arre, [[1, 2], [3, 4]]),
	   grp.get_is(arro, [[1, 2], [3, 4], [5]]),
	   grp.putback_is([[1, 2], [3, 4], [5]], [], arro),
	   grp.putback_is([[1, 2], [3, 4]], [], arre),
	   grp.putback_is([[1, 2, 'extra'], ['missing'], [3, 4]], [],
	                    [1, 2, 'extra', 'missing', 3, 4]));
})();

/* Tests for LConcat */
(function () {
	var cat = concat(' ');
    // taken from Combinators for Bi-Directional Tree Transformations, p.34
	var l = [['C', 'h', 'r', 'i', 's'], ['S', 'm', 'i', 't', 'h']];
	var c = ['C', 'h', 'r', 'i', 's', ' ', 'S', 'm', 'i', 't', 'h'];
	
	$T('the concat lens',
	   cat.getput([]),
	   cat.getput([[1, 2, 3]]),
	   cat.getput(l),
	   cat.putget([], undefined),
	   cat.putget([1, 2, 3], undefined),
	   cat.putget([1, 2, 3], []),
	   cat.putget(c, undefined),
	   cat.putget(c, []),
	   cat.putget(c, l),
	   cat.get_is(l, c),
	   cat.putback_is(c, undefined, l),
	   cat.putback_is(c, [], l),
	   cat.putback_is(c, l, l));
})();

/* Tests for LListFilter */
(function () {
	var filter = list_filter(function (c) { return c[0] == 'd'; },
							 function (c) { return c[0] == 'e'; });
    // taken from Combinators for Bi-Directional Tree Transformations, p.34
	var l = ['e1', 'd1', 'e2'];
	
	$T('the list_filter lens',
	   filter.get_is(l, ['d1']),
	   filter.putback_is(['d1'], [], ['d1']),
	   filter.putback_is(['d1'], l, l),
	   filter.putback_is(['d2'], l, ['e1', 'd2', 'e2']),
	   filter.getput([]),
	   filter.putget([], []),
	   filter.getput(l),
	   filter.putget(['d1'], l),
	   filter.putget(['d1', 'd2', 'd3'], l),
	   filter.getput(['e1', 'e2']));
})();

// LIST LENSES }}}

// {{{ COMPOSITE LENSES

/* Tests for LLayout */
(function () {
    var add5 = plus(5, 0);
    var times5 = times(5, 0);
    var l = layout('foo', add5, 
                   'bar', 'baz', 
                   'quux', times5);
    var fooquux = { foo : 5, quux : 3 };
    var list = [10, 'baz', 15];
    
    $T('the layout lens',
       l.get_is(fooquux, list),
       l.putback_is(list, undefined, fooquux),
       l.getput(fooquux),
       l.putget(list, undefined),
       l.putget(list, {}),
       l.putget(list, fooquux),
       test_bindings(l, add5),
       test_bindings(l, times5));
})();

// COMPOSITE LENSES }}}

// {{{ DOM LENSES

/* Tests for LTextTag */
(function () {
    var text = text_tag();
    var num = document.createTextNode(5);
    var foo = document.createTextNode('foo');  
    
    $T('the text_tag lens',
       text.getput(0),
       text.getput(5),
       text.getput('foo'),
       text.putget(num, undefined),
       text.putget(num, '0'),
       text.putget(num, 'foo'),
       text.putget(foo, undefined),
       text.putget(foo, 0),
       text.putget(foo, 'bar'),
       text.get_is(undefined, document.createTextNode('undefined')),
       text.get_is(5, num),
       text.get_is('foo', foo),
       text.putback_is(document.createTextNode('undefined'), undefined, 'undefined'), // violates PUTGET
       text.putback_is(num, 3, 5),
       text.putback_is(foo, 'bar', 'foo'));
})();

/* Tests for LConstTag */
(function () {
    function run_tests(msg, br, e) {
        $T('the constant_tag lens (' + msg + ')',
           br.getput(undefined),
           br.getput(0),
           br.getput(20),
           br.getput({ foo: 5 }),
           br.putget(e, undefined),
           br.putget(e, 0),
           br.putget(e, 20),
           br.putget(e, { foo: 5 }),
           br.get_is(undefined, e),
           br.get_is(20, e),
           br.putback_is(e, 5, 5),
           br.putback_is(e, undefined, 5));
    }
    
    var e = document.createElement('br');
    run_tests('constant_tag BR', constant_tag('br', 5), e);
    run_tests('br_tag', br_tag(5), e);
    
    e = document.createElement('hr');
    e.setAttribute('width', '50%');
    run_tests('constant_tag HR', constant_tag('hr', 5, { width: '50%' }), e);
    run_tests('hr_tag', hr_tag(5, { width: '50%' }));
})();

/* Tests for LTag */
(function () {
    var div = tag('div');
    
    var num_div = document.createElement('div');
    num_div.appendChild(document.createTextNode(5));    
    
    var foo_div = document.createElement('div');
    foo_div.appendChild(document.createTextNode('foo'));

    var tag_tests = function (tag, lens, num, foo) {
        $T('the tag lens (' + tag + ')',
           lens.getput(0),
           lens.getput('foo'),
           lens.putget(num, undefined, 5),    
           lens.putget(num, 5, 5),
           lens.putget(num, 'foo', 5),
           lens.putget(foo, undefined, 'foo'),
           lens.putget(foo, 5, 'foo'),
           lens.putget(foo, 'foo', 'foo'),
           lens.get_is(5, num),
           lens.get_is('foo', foo),
           lens.putback_is(num, 3, 5),
           lens.putback_is(foo, 'bar', 'foo'));
    };

    tag_tests('DIV', div, num_div, foo_div);
    tag_tests('real DIV', div_tag(), num_div, foo_div);
       
    var input = tag('input', 'value', { id: 'text' });
    
    var num_input = document.createElement('input');
    num_input.setAttribute('id', 'text');
    num_input.setAttribute('value', 5);
    
    var foo_input = document.createElement('input');
    foo_input.setAttribute('id', 'text');
    foo_input.setAttribute('value', 'foo');
    
    tag_tests('INPUT', input, num_input, foo_input);
    tag_tests('real INPUT', input_tag({ id: 'text' }),
              num_input, foo_input);
    
    var big_div = tag('div', 'child',
                      { id: 'big_div', 'class': 'big_things' },
                      ['Some preliminary text.']);
    var big_lay = plunge('foo').
                  div_tag({ id: 'big_div', 'class': 'big_things' },
                          'text', 'Some preliminary text.',
                          'foo', id_lens());

    function makeBigDiv(v) {
        var node = document.createElement('div');
        node.setAttribute('id', 'big_div');
        node.setAttribute('class', 'big_things');
        node.appendChild(document.createTextNode('Some preliminary text.'));
        node.appendChild(document.createTextNode(v));
        
        return node;         
    }    
    
    var num_bdv = makeBigDiv(5);
    var foo_bdv = makeBigDiv('foo');
    
    tag_tests('complex DIV', big_div, num_bdv, foo_bdv);
    tag_tests('complex DIV with layout', big_lay, num_bdv, foo_bdv);
    
    var big_seq = input_tag({ id: 'text' },
                            plus(5, 0));
    $T('the tag lens (complex DIV with seq)',
       big_seq.getput(0),
       big_seq.getput(5),
       big_seq.putget(num_input, undefined),
       big_seq.putget(num_input, 0),
       big_seq.putget(num_input, 5),
       big_seq.get_is(0, num_input),
       big_seq.putback_is(num_input, 0, 0),
       big_seq.putback_is(num_input, 5, 0),
       big_seq.putback_is(num_input, undefined, 0));
})();

/* Tests for LOptionTag */
(function () {
    var option = option_tag();

    var simple_node = document.createElement('option');
    simple_node.setAttribute('value', 'foo');
    simple_node.appendChild(document.createTextNode('foo'));
    
    var complex_node = document.createElement('option');
    complex_node.setAttribute('value', 'bar');
    complex_node.appendChild(document.createTextNode('foo'));
    var barfoo = { value: 'bar', text: 'foo' };  
    
    $T('the option_tag lens',
       option.getput(5),
       option.getput('foo'),
       option.getput({ value: 5, text: 'foo' }),
       option.putget(simple_node, 'foo'),
       option.putget(complex_node, barfoo),
       option.get_is('foo', simple_node),
       option.putback_is(simple_node, 'bar', 'foo'),
       option.putback_is(simple_node, barfoo, { value: 'foo', text: 'foo' }),
       option.get_is(barfoo, complex_node),
       option.putback_is(complex_node, {}, barfoo),
       option.putback_is(complex_node, 'foo', 'foo')); 
     
})();

// DOM LENSES }}}

// {{{ ERROR STACKS

/* Tests for the proper construction of stack traces */
(function () {
    var ab_valid = { a: { foo: 0 }, b: { foo: 5 } };
    var ab_got = { a: 5, b: 10 };
    
    function run_tests(lens, funs) {
        function valid_trace(e) {
            var stack = e.stack();
            
            if (stack.length != funs.length) { return false; }
            for (var i = 0;i < stack.length;i++) {
                if (stack[i].fun != funs[i]) { return false; }
            }
    
            return true;
        }
        
       $T('error stack trace system',
          lens.get_is(ab_valid, ab_got),
          lens.putback_is(ab_got, ab_valid, ab_valid),
          lens.getput(ab_valid),
          lens.putget(ab_got, {}),
          lens.putget(ab_got, ab_valid),
          lens.get_throws({ a: 5 }, valid_trace));
    }
    
    var arith = map(hoist('foo', true).plus(5, 0));
    run_tests(arith, ['hoist', 'seq', 'map']);
    
    var marked = stack_marker(arith, 'root', 'hit the bottom!');
    run_tests(marked, ['hoist', 'seq', 'map', 'root']);
    
    var dom = input_tag({}, hoist('foo'));
    
    $T('the stack_marker lens',
       marked.get_throws({ a: 5 }, function (e) {
           var stack = e.stack();
           var root = stack[stack.length - 1];
           
           return root.fun == 'root' &&
                  root.args === undefined &&
                  root.context == 'hit the bottom!';
       }),
       dom.get_throws(5, function (e) {
           var stack = e.stack();
           
           var funs = ['hoist', 'seq', 'input_tag'];
           if (stack.length != funs.length) { return false; }
           for (var i = 0;i < stack.length;i++) {
               if (stack[i].fun != funs[i]) { return false; }
           }
           
           var root = stack[stack.length - 1];
           return root.args == undefined && 
                  root.context == 'seq calling convention';
       }),
       test_bindings(marked, arith));
})();

// ERROR STACKS }}}

// BINDING {{{

/* Tests for proper maintenance of bindings */
(function () {
    var simple = plus(5, 0);
    
    // get and putback should be methods, but we only need placeholders
    var binding1 = { get: 'blah', putback: 'blah' };
    var binding2 = { get: 'foo', putback: 'bar' };
    
    function bind_result_is(lens, action, binding, expected) {  
        return function () {
            var fun = action == 'bind' ? lens.bind : lens.unbind;
            
            fun.call(lens, binding);
            
            return equal(lens.bindings, expected);
        };
    }
                              
    $T('bind/unbind (simple)',
       function () { return equal(simple.bindings, []); },
       bind_result_is(simple, 'bind', binding1, [binding1]),
       bind_result_is(simple, 'bind', binding2, [binding1, binding2]),
       bind_result_is(simple, 'unbind', binding2, [binding1]),
       bind_result_is(simple, 'bind', binding2, [binding1, binding2]),
       bind_result_is(simple, 'unbind', binding1, [binding2]),
       bind_result_is(simple, 'bind', binding1, [binding2, binding1]),
       bind_result_is(simple, 'unbind', binding1, [binding2]),
       bind_result_is(simple, 'unbind', binding2, []));
})();

// BINDING }}}

// TESTS }}}

return runTests;

}
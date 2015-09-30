/**
 * @fileoverview
 * Implements the lens bidirectional tree combinators for JavaScript and
 * Flapjax.
 * 
 * @author Michael Greenberg
 * @version 1
 */

/**
 * Initializes the lens system.
 *
 * @param contracts Either the results of initContracts from contracts.js, or
 *     false; if it is the contracts object, then contracts will be applied to
 *     lenses for better error reporting.
 * @param {Boolean} provideGlobal If true (the default), then lens identifiers
 *     will be exported into the global scope
 */
function initLenses(flapjax, initContracts, provideGlobal) {

/*******************************
 * {{{ INITIALIZATION
 *******************************/


/**
 * A function that does nothing.
 */
var nil = function () { };

/**
 * A handle to Flapjax, with necessary functions reduced to do-nothing functions
 * if the library isn't present.
 */
var fx = flapjax || { receiver_b: nil };

/**
 * A handle to the contracts library, with necessary functions reduced to
 * do-nothing functions if the library isn't present.
 */
var contracts = (initContracts &&
                 initContracts(false, true, 
                     function (guilty, received, expected) {
                         return error(guilty, 'got ' + received + 
                                              ', but expected ' + expected);
                     })) || {
    Contract: nil,
    ContractViolationException: nil,
    ContractArgsException: nil,
    flat: nil,
    func: nil,
    args: nil,
    varargs: nil,
    or: nil,
    guarded: function (ctc, val) {
        return function (pos, neg) { return val; };
    },
    guard: function (ctc, val, pos, neg) { return val; },
    cInstanceof: nil,
    cTypeof: nil,
    cNum: nil,
    cBool: nil,
    cString: nil,
    cFunction: nil,
    cAny: nil,
    cArrayof: nil,
    cArray: nil };
provideGlobal = provideGlobal || true;

// INITIALIZATION }}}

/*******************************
 * {{{ UTILITY FUNCTIONS
 *******************************/

/**
 * Determines whether p is a property of o.  If o is not an object, then this
 * function returns true for all p.
 *
 * @param o The value to test
 * @param {String} p The property to check for
 * @return {Boolean} True if p in o
 */
function has_prop(o, p) {
    return typeof o == 'object' && p in o;
}

/**
 * Determines whether x is a member of ls, perhaps using a comparator eq.
 *
 * @param {Array} ls An array to test for membership
 * @param x The potential member of ls
 * @param {Function} eq An optional two-argument comparator function; by 
 *     default, === is used
 * @return {Boolean} True if x is a member of ls, false otherwise
 */
function contains(ls, x, eq) {
    for (var i = 0;i < ls.length;i++) {
        var x_i = ls[i];
        if (eq ? eq(x_i, x) : x_i === x) { return true; }
    }
    
    return false;
}

/**
 * Determines whether o is a DOM object.
 *
 * @param o A value to test
 * @param {Boolean} True if o is a DOM object
 */
function dom_obj(o) {
    return typeof o == 'object' && (o instanceof Node || o.nodeType > 0);
}

/**
 * Creates a closure of a function on a given object; when the closure is
 * called, the 'this' object for the function will be the object given.
 *
 * @param {Object} o The object to use as <tt>this</tt>
 * @param {Function} f The function to call with <tt>o</tt> as <tt>this</tt>
 * @return {Function} A function that calls <tt>f</tt> with <tt>o</tt> as
 *     <tt>this</tt>
 */
function closure(o, f) {
    return function () {
        return f.apply(o, arguments);
    };
}

/**
 * Recursively tests equality of objects.  equal(o, undefined) for
 * any o.
 *
 * @param o1 First value to compare
 * @param o2 Second value to compare
 * @return {Boolean} true if o1 and o2 are recursively equal 
 */
function equal(o1, o2) {
    if (o1 === o2 || o1 == o2) { return true; }
    if (o1 === undefined || o2 === undefined) { return true; }
      
    if (typeof o1 == 'object' && typeof o2 == 'object') {
        // special case for DOM nodes -- just compare types, children, and vals
        if (dom_obj(o1) && dom_obj(o2)) {
            return o1.nodeType == o2.nodeType &&
                   equal(o1.attributes, o2.attributes) && 
                   equal(o1.nodeValue, o2.nodeValue);
        }
    
        var checked = {};
        
        // check each property in o1...
        for (var p in o1) {
            // if it matches (recursively), then mark it as checked and go on...
            if (p in o2 && equal(o1[p], o2[p])) {
                checked[p] = true;
            // if it doesn't match, then we can exit early with false            
            } else {
                return false;
            }
        }
        
        // now we check properties in o1 that we haven't already seen...
        for (p in o2) {
            // if it doesn't match, return false early
            if (!(p in checked) && (!(p in o1) || !equal(o1[p], o2[p]))) {
                return false;
            }
        }
        
        // if we made it here, everything is equal!
        return true;
    }
    
    // if o1 and o2 aren't objects, then they're functions -- nothing we can do
    // if they're not ==
    return false;
}

/**
 * Clones an object or an array (shallowly); anything else is simply returned.
 *
 * @param o The value to be cloned
 * @param as_array Set to true to force the argument to be treated as an array;
 *     the default is false
 * @return A shallow copy of the object
 */
function clone(o, as_array) {
    return deep_clone(o, as_array, true);
}

/**
 * Clones an object or an array (deeply); anything else is simply returned.
 * Objects with a clone method will simply have that method called; it is 
 * assumed that the clone method will do deep cloning.
 *
 * @param o The value to be cloned
 * @param as_array Set to true to force the argument to be treated as an array;
 *     the default is false
 * @param shallow Set to true to disable object and array recursion; the default
 *     is false.  Note, however, that the clone method is still expected to be
 *     deep
 * @return A deep copy of the object
 */
function deep_clone(o, as_array, shallow) {
    as_array = as_array || false;
    shallow = shallow || false;
    
    if (typeof o != 'object') {
        return o;
    }
    
    if ('clone' in o && typeof o.clone == 'function') {
        return o.clone();
    } else if (dom_obj(o)) {
        var copy = o.cloneNode(true);
        // account for some strange cloning problems
        fix_dom_clone(o, copy);
        
        return copy;
    }
    
    if (o instanceof Array || as_array) {
        var arr = [];
        for (var i = 0;i < o.length;i++) {
            arr.push(shallow ? o[i] : deep_clone(o[i]));
        }
        
        return arr;
    }
    
    var copy = {};
    for (var prop in o) {
        copy[prop] = shallow ? o[prop] : deep_clone(o[prop]);
    }
    
    return copy;
}

/**
 * @class
 * <p>Creates a predicate from an object, returning a single-argument function
 * that returns true on certain input, as described below.</p>
 * <p>In general, wherever a predicate is asked for by a function, any of the
 * types in the left-hand column of the table below may be supplied.</p>
 * <table>
 * <tr><td>typeof p</td><td>behavior of returned function in terms of argument
 * c</td></tr>
 * <tr><td>function</td><td>p</td></tr>
 * <tr><td>Predicate</td><td>p.matches</td></tr>
 * <tr><td>Array</td><td>contains(p, c)</td></tr>
 * <tr><td>object</td><td>true if c is value of one of p's properties</td></tr>
 * <tr><td>anything else</td><td>true if c === p</td></tr>
 *
 * @param p The predicate source
 */
function Predicate(p) {
    var tp = typeof p;
    
    this.matches = (tp == 'function') ? p :
                   (p instanceof Predicate) ? p.matches :
                   (p instanceof Array) ? function (c) {
                       return contains(p, c);
                   } :
                   (tp == 'object') ? function (c) {
                       for (var prop in p) {
                           if (c == p[prop]) { return true; }
                       }
                       return false;
                   } : function (c) { return p === c; };    
    return this; 
}

// UTILITY FUNCTIONS }}}

/*******************************
 * {{{ ERROR HANDLING
 *******************************/

/**
 * @class
 * A general exception for lenses.  It has methods with_frame and stack; the
 * former takes a function name, the arguments it was passed (it is safe to pass
 * the actual arguments object, which will be copied), and a context message;
 * the latter returns a copy of the current stack, with the oldest frame first.
 * Note that with_frame returns the error object again, so the idiom
 * <code>throw e.with_frame(...)</code> is not only acceptable, but preferred.
 *
 * @constructor
 * @param {Lens} lens The lens in which the error occurred (it is also
 *     permissible to pass a string identifying the source location, e.g.
 *     function name)
 * @param {String} msg A description of the error
 * @param {Array} args The arguments passed to the lens or function in which
 *     the error occurred
 */
function LensException(lens, msg, args) {
    this.lens = lens;
    this.msg = msg;
    this.name = "LensException";

    var stack = [];
    this.with_frame = function (f, args, ctx) {
        stack.push({ 'fun': f, 'args': clone(args, true), 'context': ctx });
        return this;
    };
    this.stack = function () {
        return clone(stack);
    };
    
    return this.with_frame(is_lens(lens) ? lens.name : lens, args, msg);
}
LensException.prototype = new Error();

/**
 * One possible behavior on error: throw.
 */
function throw_on_error(source, msg, args) {
    throw new LensException(source, msg, args);
}

/**
 * One possible behavior on error: alert.
 */
function alert_on_error(source, msg) {
    alert(['error in ', source, ': ', msg].join(''));
}

/**
 * One possible behavior on error: start a debugger with the debugger keyword.
 */
function debugger_on_error(source, msg) {
    debugger; // commented out for Safari, which gets upset
}

/**
 * One possible behavior on error: log the error to the Firebug console.
 */
function log_on_error(source, msg, args) {
    console.log('Error [%o(%o)]: %o', source, args, msg);
}

/**
 * Called on error.  Configurable behavior; the default is to throw
 * an exception.
 */
var error = throw_on_error;

/**
 * Sets the current error handler.  Possible values include {@link 
 * #throw_on_error}, {@link #alert_on_error}, {@link #debugger_on_error}, and
 * {@link #log_on_error}.  Handlers will be passed a source identifier and an
 * error message.
 *
 * @param {Function} handler An error handler: function (source, msg) { ... }
 * @return {Function} The old, replaced error handler
 */
function set_error_handler(handler) {
    var old_handler = error;
    error = handler;
    return old_handler;
}

/*******************************
 * {{{ CONTRACTS
 *******************************/

// Make contracts available outside of the contracts object
for (var id in contracts) {
    eval(['var ', id, ' = contracts.', id, ';'].join(''));
}

/**
 * A contract for primitive values, e.g. non-functions.
 */
var prim_c = flat(function (o) { 
        return typeof o != 'function';
}, 'primitive value');

/**
 * A contract for a lens object.
 *
 * @param {Contract} get_c The contract for the get operation
 * @param {Contract} putback_c The contract for the putback operation
 * @return {Contract} A contract 'lens_c' that enforces get_c and putback_c 
 */
function lens_c(get_c, putback_c) {
    return flat(function (o) {
//        o.get = contracts.guard(get_c, o.get, 'user code', o.name);
//        o.putback = contracts.guard(putback_c, o.putback, 'user code', o.name);
        
        return is_lens(o);
    }, 'lens_c');
}

/**
 * A contract for a {@link Lens}-derived lens constructor, that enforces
 * a calling convention, as well as get and putback contracts on the generated
 * lens.  Zero or more argument contracts are given, followed by a get contract
 * and a putback contract.
 *
 * @return {Contract} A contract for a lens constructor
 */
function lens_constructor(/* arg1, arg2, ..., get_c, putback_c */) {
    var args = clone(arguments, true);
    var putback_c = args.length > 0 ? args.pop() : cAny();
    var get_c = args.length > 0 ? args.pop() : cAny;
    args.push(lens_c(get_c, putback_c));
    
    return func.apply({}, args);
}

// CONTRACTS }}}

// ERROR HANDLING }}}

/*******************************
 * {{{ FLAPJAX
 *******************************/

/**
 * Creates a model that changes over time.  It can be used with 
 * {@link #bind_lens_to} to create views in the DOM.
 *
 * @param v The initial value
 * @return {Behaviour} The model
 */
function model_b(v) {
    return fx.receiver_b(v);
}

// FLAPJAX }}}

/*******************************
 * {{{ LENSES
 *******************************/

/**
 * Returns true if a given object is a lens.  It tests this by 'duck typing' --
 * any object with get and putback properties that are functions is considered
 * a lens.
 * @param o Any object
 * @return {Boolean} True if o is a lens
 */
function is_lens(o) {
    return o instanceof Lens || 
           (typeof o == 'object' && 
           'get' in o && typeof o.get == 'function' &&
           'putback' in o && typeof o.putback == 'function');
}
 
/*******************************
 * {{{ LENS REGISTRATION
 *******************************/

/**
 * The lens registry. 
 */
var __lenses = {};

/**
 * Converts a lens constructor into a lens function.
 *
 * @param {Lens} lens The lens constructor
 * @param {String} name The lens' name
 * @return {Function} A lens-creating function -- it behaves like the
 *     constructor in every way, except that 'new' is not necessary 
 */
function make_lens_function(lens, name) {
    return function (/* args */) {
        // get the prototype set correctly
        var o = new Lens();
        
        // set the lens' name
        o.name = name;
        
        // simulate a call to new on the given lens
        return lens.apply(o, arguments);
    };
}

/**
 * <p>Updates the {@link Lens} prototype to have a method with the given name
 * that calls the lens function (see {@link #make_lens_function}) fun as the
 * second argument to an LSeq, e.g. if the lens foo is added to the prototype,
 * then any lens may call <tt>l.foo(...)</tt> with meaning 
 * <tt>seq(l, foo(...))</tt>.  Naturally, this behavior is not done for seq 
 * itself, by setting the third parameter to true.</p>
 * <p>This function should not be called directly, as {@link #$L} will call it
 * for you.</p>
 *
 * @param {String} name The name of the lens
 * @param {Function} fun The lens function, from {@link #make_lens_function}
 * @param {Boolean} no_seq By default false, set to true to remove the implicit
 *     LSeq; instead, the lens (e.g. l in l.foo(...)) will be the first argument
 *     to fun, followed by ...
 */
function update_lens_prototype(name, fun, no_seq) {
    no_seq = no_seq || false;
    
    if (!no_seq) {
        Lens.prototype[name] = function () {
            return new LSeq(this, fun.apply({}, arguments));
        };
    } else {
        Lens.prototype[name] = function () {
            var args = clone(arguments, true);
            return fun.apply({}, [this].concat(args));
        };
    }
}

/**
 * A shared prototype for lenses.
 */
var __lens_proto = new Lens();

/**
 * Registers a lens.  This stores the result of {@link #make_lens_function} in
 * a registry, and calls {@link #update_lens_prototype} appropriately.
 * 
 * @param {Lens} lens The lens
 * @param {String} lens_name The name of the lens
 * @param {Contract} contract An optional contract to apply to the lens
 * @param {Boolean} By default false, setting it to true will change the
 *     behavior of dot sequencing to treat the lens like LSeq, e.g. not insert
 *     an implicit call to LSeq; see {@link #update_lens_prototype} for more.
 */
function $L(lens, name, contract, no_seq) {
    if (contract !== undefined) {
        lens = contracts.guard(contract, lens, name, 'user code');
    }
    
    var fun = make_lens_function(lens, name);
    __lenses[name] = { 'lens': lens, 'fun': fun };
    lens.prototype = __lens_proto;
    update_lens_prototype(name, fun, no_seq);
}

// LENS REGISTRATION }}}

/*******************************
 * {{{ BASIC LENSES
 *******************************/ 

/**
 * @class
 * <p>Lenses work over two domains, A ("abstract") and C ("concrete").  The types
 * of the get and putback functions are:</p>
 * <pre>
 *     get :: C -> A
 *     putback :: A x C -> C
 * </pre>
 * <p>Thus these are much better termed "project" and "merge".  In the case of
 * the lens library, C is taken to be a JavaScript model (e.g. the domain of 
 * values in JavaScript) and A is taken to be the DOM.  Thus, in Flapjax terms,
 * get is "insertDom" and putback is "extract".  Don't be daunted by the use of
 * 'abstract tree' and 'concrete tree' in the documentation -- it's an artifact
 * of the theoretical research on bidirectional computation.</p>
 * <p>Lenses are themselves implemented as objects with get and putback methods;
 * the resulting lens driver requires nothing else, but won't interfere with
 * other fields or methods.  Thus it is not required to have the prototype of a
 * lens constructor point to Lens, but this library follows that pattern.</p>
 * <p>Important lens methods include {@link Lens#clone} and 
 * {@link Lens#for_each_sublens}.  The former should create a copy of a lens 
 * with fresh state; if the lens has no state and no sublens, it is safe to 
 * return this, which is the default behavior.  The latter iterates a function 
 * over sublenses.</p>
 * <p>The function {@link Lens#stateful} 
 *
 * @constructor
 */
function Lens() {
    this.name = undefined;
    
    this.stateful = function () {
        var stateful_child = false;
        
        this.for_each_sublens(function (sl) {
            if (sl.stateful()) { stateful_child = true; }
        });
        
        return stateful_child;
    };
    this.clone = function () { return this; };
    this.for_each_sublens = function (f) { };
    
    this.bindings = [];
    this.bind = function (binding) { 
        // avoid aliasing
        var bindings = clone(this.bindings);
        
        // avoid duplicates
        if (contains(bindings, binding)) { return; }
        
        bindings.push(binding);
        this.bindings = bindings;
        
        // call recursively
        var bind = this.bind;  
        return this.for_each_sublens(function (sl) { sl.bind(binding); });
    };
    this.unbind = function (binding) {
        var bindings = clone(this.bindings);
        for (var i = 0;i < bindings.length;i++) {
            if (bindings[i] === binding) {
                bindings.splice(i, 1);
                this.bindings = bindings;        

                break;
            }
        }
        
        // call recursively    
        var unbind = this.unbind;
        return this.for_each_sublens(function (sl) { sl.unbind(binding); });
    };
    this.copy_bindings = function (l) {
        var bindings = clone(l.bindings);
        for (var i = 0;i < bindings.length;i++) {
            this.bind(bindings[i]);
        }
    };
    
    this.error = function (msg, args) { error(this.name, msg, args); };
    this.wrap_exception = function (e) {
        if (e instanceof LensException) { return e; }
        
        var le = new LensException(this.name, 
                                   'Caught exception ' + e.name + ': ' + 
                                   e.message,
                                   []);
        le.cause = e;
        
        return le;
    };
    
    return this;
}
 
/**
 * @class
 * The identity lens.
 *
 * @extends Lens 
 */
function LId() {    
    this.name = 'id_lens';
    this.get = function (c) { return c; };
    this.putback = function (a, c) { return a; };
    
    return this;     
}
$L(LId, 'id_lens');

/**
 * @class
 * The stack marking lens; marks the stack with a message, which will be 
 * included in stack traces.  This is useful for composite lenses in particular
 * and for debugging in general.
 *
 * @combinator
 * @extends Lens
 * @param {Lens} lens The lens to run with the stack mark
 * @param {String} source The 'origin' of the message           
 * @param {String} msg The message to display, if any
 */
function LStackMarker(lens, source, msg) {
    msg = msg || '';

    this.clone = function () {
        if (!lens.stateful()) { return this; }
        
        var l = new LStackMarker(lens.clone(), source, msg);
        l.copy_bindings(this);
        return l;
    };
    this.for_each_sublens = function (f) {
        // only one sublens
        f(lens);
    };
    
    this.name = 'stack_marker';
    this.get = function (c) {
        try {
            return lens.get(c);
        } catch (e) {
            throw this.wrap_exception(e).with_frame(source, undefined, msg);
        }
    };
    this.putback = function (a, c) {
        try {
            return lens.putback(a, c);
        } catch (e) {
            throw this.wrap_exception(e).with_frame(source, undefined, msg);
        }
    };
    
    return this;
}
$L(LStackMarker, 'stack_marker', undefined, true); // true -> no_seq

/**
 * @class
 * The error lens; triggers an error on either get or putback.
 *
 * @extends Lens
 * @param {String} source The source of the error
 * @param {String} msg The error message itself; 'GET: ' and 'PUTBACK: ' will
 *     be prepended appropriately
 */
function LError(source, msg) {
    this.name = 'error_lens';
    this.get = function () { error(source, 'GET: ' + msg); };
    this.putback = function () { error(source, 'PUTBACK: ' + msg); };
    
    return this;
}
$L(LError, 'error_lens'); //, func(args(cString, cString), lens_c(cAny, cAny)));

/**
 * @class
 * The sequencing lens; runs a lens l followed by k.  It will also take more
 * than two lenses, chaining them as LSeq(l, LSeq(k, LSeq(j, ...))).
 * 
 * @combinator
 * @extends Lens 
 * @param {Lens} l The first lens to run
 * @param {Lens} k The second lens to run
 */
function LSeq(l, k /* ... */) {
    if (arguments.length > 2) {
        // copy arguments array
        var args = clone(arguments, true);
        // call recursively on all but one
        k = LSeq.apply(new Lens(), args.slice(1)); 
    }

    this.clone = function () { 
        var l_st = l.stateful();
        var k_st = k.stateful();
        var lc = l_st ? l.clone() : l;
        var kc = k_st ? k.clone() : k;
        
        var copy = !(l_st || k_st) ? this : new LSeq(lc, kc);
        copy.copy_bindings(this);
        return copy;
    };
    this.name = 'seq';
    
    this.for_each_sublens = function (f) {
        // apply to each
        f(l);
        f(k);
    };
    
    this.get = function (c) {
        try {
            return k.get(l.get(c));
        } catch (e) {
            throw this.wrap_exception(e).with_frame(this.name, [l, k], 'get');
        }
    };
    this.putback = function (a, c) {
        try {
            return l.putback(k.putback(a, 
                                       l.get(c)), 
                             c);
        } catch (e) {
            throw this.wrap_exception(e).with_frame(this.name, [l, k],
                                                    'putback');
        }
     };
     
     return this;
}
// true -> no_seq
$L(LSeq, 'seq', undefined, true); // func(varargs(lens_c(cAny, cAny)), lens_c(cAny, cAny)), true);

/**
 * @class
 * The constant lens.  Replaces the concrete value with a given value; if
 * undefined is putback, a default value will be given.
 * 
 * @extends Lens 
 * @param v The value to substitute on get (in A)
 * @param d The default value to return on putback (in C)
 * @param {Boolean} strict Set if putback should require that the abstract tree
 *     be equal to v.  It is set by default; unsetting it can violate the
 *     putget law.
 */
function LConst(v, d, strict) {
    this.name = 'constant';
    this.get = function (c) { return deep_clone(v); };
    this.putback = function (a, c) {
        if (strict !== false && !equal(a, v)) {
            this.error(["putback: HTML argument ", a, 
                        " was edited away from ", v].join(''), [v, d, strict]); 
        }
        else if (c === undefined) { return d; }
        else { return c; }
    };

    return this;
}
$L(LConst, 'constant'); //func(varargs(prim_c, prim_c, cBool), lens_c(cAny, cAny)));

/**
 * @class
 * Wraps an invertible operator.
 * 
 * @extends Lens 
 * @param {Function} op The operator
 * @param {Function} inv The inverse of op
 * @param d The default value to return on putback (in C)
 */
function LOp(op, inv, d) {
    this.name = 'op';
    this.get = function (c) { return op(c); };
    this.putback = function (a, c) { return a === undefined ? d : inv(a); };

    return this;
}
$L(LOp, 'op');

// BASIC LENSES }}}

/******************************* 
 * {{{ ARITHMETIC LENSES
 *******************************/

/**
 * @class
 * A refinement of the {@link LOp} lens -- for binary arithmetic operators.
 *
 * @extends Lens 
 * @param {Function} op The operator
 * @param {Function} inv The inverse of op
 * @param v The second value to pass to op on get and putback
 * @param d The default value to return on putback (in C)
 */
function LArith(op, inv, v, d) { 
    LStackMarker.call(this, 
                      new LOp(function (c) { return op(c, v); },
                              function (a) { return inv(a, v); },
                              d),
                      'arith');
    this.name = 'arith';
    return this;
}
$L(LArith, 'arith');

/**
 * Generates and registers arithmetic lenses.
 *
 * @param {String} name The lens to create
 * @param {Function} op The operator
 * @param {Function} inv Its inverse
 * @param {Function} guard An optional guard over v and d, 
 *     which can throw an error if v and d are somehow invalid 
 *     for op and inv, e.g. would cause a divide-by-zero.  Takes
 *     v, and d.  For an example, see {@link #nonzero_v}.
 */
function make_arith_lens(name, op, inv, guard) {
    var f = function (v, d) {
        this.name = name; // set it for the guard
        if (guard) { guard.call(this, v, d); }
        
        LStackMarker.call(this, new LArith(op, inv, v, d), name);
        this.name = name; // reset it from when LArith overwrote it

        return this;
    };
    $L(f, name);
    return f;
}

// TODO for some reason jsdoc is unhappy with this style, so none of these
//      lenses get any documentation

/**
 * @extends Lens
 * @param {int} v Added to the concrete tree in get, subtracted from
 *     the abstract tree on putback
 * @param d The value putback if the abstract tree is undefined
 */
LPlus = make_arith_lens('plus', 
                        function (a, b) { return a + b; },
                        function (a, b) { return a - b; });
                        
/**
 * @extends Lens
 * @param {int} v Subtracted from the concrete tree in get, added to
 *     the abstract tree on putback
 * @param d The value putback if the abstract tree is undefined
 */
LMinus = make_arith_lens('minus', 
                         function (a, b) { return a - b; },
                         function (a, b) { return a + b; });

/**
 * The guard used in LTimes and LDivide to prevent v==0 from occuring.
 */
function nonzero_v(v, d) {
    if (v === 0) {
        this.error('cannot use 0 as v (first argument), since it has no inverse',
            [v, d]);
    }
}

/**
 * @extends Lens
 * @param {int} v Multiplied with the concrete tree in get, divides from
 *     the abstract tree on putback
 * @param d The value putback if the abstract tree is undefined
 */                         
LTimes = make_arith_lens('times',
                         function (a, b) { return a * b; },
                         function (a, b) { return a / b; },
                         nonzero_v);

/**
 * @extends Lens
 * @param {int} v Divided from the concrete tree in get, multiplies with
 *     the abstract tree on putback
 * @param d The value putback if the abstract tree is undefined
 */
LDivide = make_arith_lens('divide',
                          function (a, b) { return a / b; },
                          function (a, b) { return a * b; },
                          nonzero_v);

// ARITHMETIC LENSES }}}

/*******************************
 * {{{ OBJECT LENSES
 *******************************/
                          
/**
 * @class
 * <p>A primitive lens for working with objects; it will 'hoist' a property
 * of a single property object, e.g.:</p>
 * <code>
 * <br /> &gt; h = new LHoist('foo')
 * <br /> &gt; h.get({foo : 5})
 * <br /> 5
 * <br /> &gt; h.putback(5, _) // _ is anything
 * <br /> { 'foo': 5 }
 * </code>
 * <p>By Pierce and Foster's definition, hoist should only accept objects with a
 * single property.  For convenience, more objects with more than one property
 * will be accepted by hoist; however, missing values will not be returned on 
 * putback.  If missing values should be restored on putback, use {@link LFocus}.</p>
 * <p>Hoist will also (non-standardly) accept objects on get without the desired 
 * property; undefined will be returned.</p>
 *
 * @extends Lens
 * @param {String} prop The property of the concrete tree to select for.  It 
 *     must have only one property.  For a more permissive form of hoisting,
 *     see {@link LFocus}.
 * @param {Boolean} check_prop Whether or not to check that the property prop
 *     is really present and the only property.  If it is not, an error will be
 *     signalled.  This is false by default.
 * @see LHoistNonunique
 */
function LHoist(prop, check_prop) {
    check_prop = check_prop || false;

    this.name = 'hoist';
    
    this.get = function (c) {
        if (c === undefined) { return undefined; }
        if (typeof c != 'object') {
            this.error('get: expected object, got ' + c,
                       [prop, check_prop]);
        }
        if (check_prop) {        
            if (!(prop in c)) {
                this.error(['get: property ', prop, ' not found in ' + c].join(''),
                           [prop, check_prop]); 
            }
            
            for (var p in c) {
                if (p != prop) {
                    this.error(['get: expected object with only property ', prop,
                                ' but also found ', p, ' in ', c].join(''),
                               [prop, check_prop]);
                }
            }
        }
         
        return c[prop];
    };
    this.putback = function (a, c) {
        var o = {};
        o[prop] = a;
        return o;
    };
    
    return this;
}
$L(LHoist, 'hoist');

/**
 * @class
 * <p>The dual of {@link LHoist}, it pushes the concrete argument into an object
 * under a specific property in the get direction, e.g.:</p>
 * <code>
 * <br /> &gt; p = new LPlunge('foo')
 * <br /> &gt; p.get(5)
 * <br /> { foo: 5 }
 * <br /> &gt; p.putback({ foo: 5 }, _) // _ is anything
 * <br /> 5
 * </code>
 * <p>Strictness issues are as in {@link LHoist}.</p>
 *
 * @extends Lens
 * @param {String} prop The property under which to plunge.
 * @param {Boolean} check_prop Set to true to require that the tree on putback
 *     have one and only one property -- prop.  The default is false, and so
 *     checking is more lax, but missing properties will not be reconstructed at
 *     the next get.
 */
function LPlunge(prop, check_prop) {
    check_prop = check_prop || false;    
    
    this.name = 'plunge';
    this.get = function (c) {
        var o = {};
        o[prop] = c;
        return o;
    };
    this.putback = function (a, c) {
        //if (a == undefined) { return undefined; } // ??? should we allow this?
        if (typeof a != 'object') {
            this.error('putback: expected object in putback, got ' + a,
                       [prop, check_prop]);
        }
        if (check_prop) {        
            if (!(prop in a)) {
                this.error(['putback: property ', prop, ' not found in ' + a].join(''),
                           [prop, check_prop]); 
            }
            
            for (var p in a) {
                if (p != prop) {
                    this.error(['putback: expected object with only property ', prop,
                                ' but also found ', p, ' in ', a].join(''),
                               [prop, check_prop]);
                }
            }
        }
        
        return a[prop];
    };
    
    return this;
}
$L(LPlunge, 'plunge');

/**
 * Splits an object in two: one whose properties all match a predicate, and the
 * rest which fail.
 *
 * @param {Object} o The object to split
 * @param {Function} pred The predicate over property names
 * @return {Object} An object o where o.passed has passing properties and
 *     o.failed has failing properties.
 */
function split_object(o, pred) {
    if (o === undefined) { return { 'passed': undefined, 'failed': undefined }; }

    var passed = {};
    var failed = {};
    
    // split c into matching and non-matching parts
    for (var prop in o) {
        (pred.matches(prop) ? passed : failed)[prop] = o[prop];
    }

    return { 'passed': passed, 'failed': failed };
}


/**
 * Merges two objects.  If their properties aren't disjoint, than the procedure
 * error is called, if it was provided.
 *
 * @param {Object} o1 The first object
 * @param {Object} o2 The second object
 * @param {Function} error Optional.  Called if a property in o2 is also in o1
 * @return {Object} The union of o1 and o2
 */
function merge_objects(o1, o2, error) {
    if (o1 === undefined) { return o2; }
    if (o2 === undefined) { return o1; }

    var merged = {};
    
    for (var prop in o1) {
        merged[prop] = o1[prop];
    }    
    
    for (prop in o2) {
        if (prop in merged && error) {
            error('merge_objects', prop, [o1, o2, error]);
        }
        merged[prop] = o2[prop];
    }
    
    return merged;
}

/**
 * @class
 * <p>Splits a concrete tree, passing part through one lens and part through
 * another.  Those parts which pass predicates pred_c and pred_a will go
 * through pass_lens; whatever remains will be passed through fail_lens.</p>
 * <p> If either of pred_{a,c} are not actually predicates, they will be made
 * into predicates by means of the {@link Predicate} constructor.
 *
 * @combinator
 * @extends Lens
 * @param {Predicate} pred_c A predicate over concrete-tree properties; those
 *     passing properties will be taken as a single object and passed through
 *     pass_lens in the get direction; in the putback direction, it will be used
 *     as the putback for pass_lens.
 * @param {Predicate} pred_a A predicate over abstract-tree properties; those
 *     passing properties will be taken as a single object during putback, and
 *     will be passed (along with pred_c-passing properties) back through
 *     pass_lens's putback.
 * @param {Lens} pass_lens Used for passing properties
 * @param {Lens} fail_lens Used for failing properties
 */                   
function LXfork(pred_c, pred_a, pass_lens, fail_lens) {
    pred_c = new Predicate(pred_c);
    pred_a = new Predicate(pred_a);
    
    this.clone = function () {
        var p_st = pass_lens.stateful();
        var f_st = fail_lens.stateful();
        var pc = p_st ? pass_lens.clone() : pass_lens;
        var fc = f_st ? fail_lens.clone() : fail_lens;
        
        var l = !(p_st || f_st) ? this : 
            new LXfork(pred_c, pred_a, pc, fc);
        l.copy_bindings(this);
        return l;
    };
    
    this.name = 'xfork';
    
    this.for_each_sublens = function (f) {                                    
        f(pass_lens);
        f(fail_lens);
    };
    
    this.get = function (c) {
        // split the object into branches whose properties pass and fail pred_c
        var split = split_object(c, pred_c);
        
        // apply the lenses to the branches appropriately
        try {
            var got_passed = pass_lens.get(split.passed);
            var got_failed = fail_lens.get(split.failed);
        } catch (e) {
            throw this.wrap_exception(e).with_frame(this.name, 
                [pred_c, pred_a, pass_lens, fail_lens], 'get');
        }

        // and merge
        var lens = this; // saved because you can't close on this
        return merge_objects(got_passed, got_failed,
                             function (prop) {
                                 lens.error('property ' + prop + 
                                            ' was in both branches during get',
                                            [pred_c, pred_a,
                                             pass_lens, fail_lens]);
                             });
    };
    this.putback = function (a, c) {
        // split a and c on their respective predicates
        var split_a = split_object(a, pred_a);
        var split_c = split_object(c, pred_c);
        
        // putback passing and failing objects separately
        try {
            var put_passed = pass_lens.putback(split_a.passed, split_c.passed);
            var put_failed = fail_lens.putback(split_a.failed, split_c.failed);
        } catch (e) {
            throw this.wrap_exception(e).with_frame(this.name,
                [pred_c, pred_a, pass_lens, fail_lens], 'putback');
        }
        
        // and merge
        var lens = this;
        return merge_objects(put_passed, put_failed,
                             function (prop) {
                                 lens.error('property ' + prop +
                                            ' was in both branches during putback',
                                            [pred_c, pred_a,
                                             pass_lens, fail_lens]);
                             });
    };
    return this;
}
$L(LXfork, 'xfork');

/**
 * @class
 * A simplified {@link LXfork}.  The concrete tree is split based on a predicate
 * over properties; the object composed of passing properties is passed to
 * pass_lens, and whatever remains is passed to fail_lens.  On putback, the
 * same predicate is used on both the abstract and the concrete trees.
 *
 * @combinator
 * @extends Lens
 * @param {Function} pred The predicate on properties
 * @param {Lens} pass_lens The lens through which the object composed of 
 *     passing properties will be passed
 * @param {Lens} fail_lens The lens through which the failing-property
 *     object will be passed
 */
function LFork(pred, pass_lens, fail_lens) {
    LStackMarker.call(this, new LXfork(pred, pred, pass_lens, fail_lens),
                      'fork');
    this.name = 'fork';
    
    return this;
}
$L(LFork, 'fork');

/**
 * @class
 * In the get direction, projects the concrete tree down to only those
 * properties matching pred.  In the putback direction, they are restored (if
 * they are present in the concrete tree).
 *
 * @extends Lens
 * @param {Function} pred A predicate matching the desired properties
 * @param d The default value to putback if nothing is found in the concrete
 *     tree
 */
function LFilter(pred, d) {
    LStackMarker.call(this, new LFork(pred, new LId(), new LConst({}, d)),
                      'filter');
    this.name = 'filter';
    
    return this;
}
$L(LFilter, 'filter');

/**
 * @class
 * Removes a given property in the get direction, replacing it in the
 * concrete tree during putback.  If the concrete tree has that property
 * undefined, then that property will get value d.
 *
 * @extends Lens
 * @param {String} prop The property to prune
 * @param d The default value for the property, if it should be undefined
 */
function LPrune(prop, d) {
    // LConst clones its default argument, so there are no aliasing issues
    var o = {};
    o[prop] = d;
    
    LStackMarker.call(this, new LFork(function (p) { return p === prop; },
                                      new LConst({}, o), new LId()),
                      'prune');
    this.name = 'prune';
    
    return this;
}
$L(LPrune, 'prune');

/**
 * @class
 * Adds a given property with a given value.  It exists only in the abstract
 * tree, and so is effectively read-only.
 *
 * @extends Lens
 * @param {String} prop The property to add
 * @param v The value of the property to add
 */
function LAdd(prop, v) {
    LStackMarker.call(this, new LXfork(function (pc) { return false; },
                                       function (pa) { return pa == prop; },
                                       new LSeq(new LConst(v, {}),
                                                new LPlunge(prop)),
                                       new LId()),
                      'add');
    this.name = 'add';
    
    return this;
}
$L(LAdd, 'add');

/**
 * @class
 * Focuses concrete tree on a single property, projecting away all other
 * properties of the object.  If, on putback, the property comes back undefined,
 * then a default value will be substituted.
 *
 * @extends Lens
 * @param {String} prop The property on which to focus
 * @param d The default value, if the abstract tree is undefined
 */
function LFocus(prop, d) {
    LStackMarker.call(this, 
                      new LSeq(new LFilter(function (p) { return p == prop; }, d),
                               new LHoist(prop)),
                      'focus');
    this.name = 'focus';
    
    return this;         
}
$L(LFocus, 'focus');

/**
 * @class
 * <p>Hoists (see {@link LHoist}) a property from among others, merging its
 * sub-properties into the root tree.  On putback, a supplied predicate
 * identifies properties which belong to the grandchild, so that those
 * properties can be putback appropriately.</p>
 * <p>Note that the property must be object-valued; anything else won't be
 * able to merge with the rest of the root tree.</p>
 *
 * @extends Lens
 * @param {String} prop The property to hoist
 * @param {Function} pred_grandchild A predicate that matches exactly those
 *     properties which belong to the object under prop
 * @see LHoist
 */
function LHoistNonunique(prop, pred_grandchild) {
    LStackMarker.call(this, new LXfork(function (cp) { return cp == prop; },
                                       pred_grandchild,
                                       new LHoist(prop),
                                       new LId()),
                      'hoist_nonunique');
    this.name = 'hoist_nonunique';
    
    return this;
}
$L(LHoistNonunique, 'hoist_nonunique');

/**
 * @class
 * Renames a property.
 *
 * @extends Lens
 * @param {String} from The property (in C) to rename
 * @param {String} to The desired property name (in A)
 * @see LRenameIfPresent
 */
function LRename(from, to) {
    LStackMarker.call(this, new LXfork(function (cp) { return cp == from; },
                                       function (ap) { return ap == to; },
                                       new LSeq(new LHoist(from),
                                                new LPlunge(to)),
                                       new LId()),
                      'rename');
    this.name = 'rename';
    
    return this;
}
$L(LRename, 'rename');

/**
 * @class
 * Maps a lens over the properties of an object.
 *
 * @combinator
 * @extends Lens
 * @param {Lens} lens The lens to map over
 */
function LMap(lens) {
    this.name = 'map';
    
    this.stateful = function () { return lens.stateful(); };
    
    var l_st = lens.stateful();
    this.clone = function () {
        if (l_st) { return this; }
        
        var l = new LMap(lens.clone());
        l.copy_bindings(this);
        return l;
    };
    
    this.for_each_sublens = function (f) {
        if (!l_st) { return f(lens); }
        
        for (var prop in mapping) {
            f(mapping[prop]);
        }
    };
    
    var mapping = {};
    function lookup(prop) {
        if (!l_st) { return lens; }
        
        var l = (prop in mapping) ? mapping[prop] : lens.clone();
        mapping[prop] = l;
        
        return l;
    }
    
    this.get = function (c) {
        // c = c || {}; // ??? should we allow undefined here?
        var o = {};
        for (var prop in c) {
            var l = lookup(prop);
            try {
                o[prop] = l.get(c[prop]);
            } catch (e) {
                throw this.wrap_exception(e).with_frame(this.name, l,
                    'get on ' + prop); 
            }
        }
        return o;
    };
    this.putback = function (a, c) {
        var o = {};

        // handle undefined values        
        a = a || {};
        c = c || {};

        // putback values in a
        for (var prop in a) {
            var l = lookup(prop);

            try {
                o[prop] = l.putback(a[prop], c[prop]);
            } catch (e) {
                throw this.wrap_exception(e).with_frame(this.name, l,
                    'putback on ' + prop);
            }
        }
        
        return o;
    };
    
    return this;
}
$L(LMap, 'map');

/**
 * @class
 * <p>Maps different lenses over different properties; it is a generalization of
 * {@link LMap}.</p>
 * <p>It has a slightly strange calling convention, to wit:</p>
 * <code>
 * <br />&gt; wmap = new LWmap([prop1, prop2, prop3], lens1, prop4, lens2)
 * </code>
 * <p>This will run lens1 over prop1, prop2, and prop3's values and lens2 on
 * prop4.  Any other properties are mapped through the id lens.  There is an
 * optional final argument, which may be set to false in order to have the
 * presence of other properties constitute an error, e.g.:</p>
 * <code>
 * <br />&gt; wmap_strict = new LWmap(p1, l1, [p2, p3], l2, false)
 * <br />&gt; wmap_strict.get({ p4: _ }) // _ is any value
 * <br />error!
 * </code>
 *
 * @combinator
 * @extends Lens
 */
function LWmap(/* props1, lens1, props2, lens2, ..., propsn, lensn, default_to_id */) {
    var last_arg = arguments[arguments.length - 1];
    var last_arg_is_lens = is_lens(last_arg);
    var real_args_length = last_arg_is_lens ? arguments.length : arguments.length - 1; 
                    
    this.name = 'wmap';
    
    /* TODO define a clone that won't do anything when there are no stateful 
       sublenses
    */
    
    // create a list deep copy of the arguments
    var args = deep_clone(arguments, true, true); // deep and as an array
    this.clone = function () {
        var l = LWmap.apply(new Lens(), args);
        l.copy_bindings(this);
        return l;
    };
    
    // store a single mapping of props to the lenses that apply to them
    var mapping = {};    
    // store each sub-lens, too
    var lenses = [];
    
    // construct the mapping and collect lenses
    for (var i = 0;i < real_args_length;i += 2) {
        var props = arguments[i];
        var lens = arguments[i + 1];
        
        // collect the lens
        lenses.push(lens);
        
        // add to the mapping
        if (props instanceof Array) {
            for (var j = 0;j < props.length;j++) {
                mapping[props[j]] = lens;
            }
        } else if (typeof props == 'string') {
            mapping[props] = lens;
        } else {
            this.error("don't know how to handle non-string property " + 
                       props, clone(arguments, true));                                
        }
    }    
    
    this.for_each_sublens = function (f) {
        // apply the function to each lens -- we don't use the mapping, or else
        // we might apply f twice to the same lens
        for (var i = 0;i < lenses.length;i++) {
            f(lenses[i]);
        }
    };
    
    var default_to_id = last_arg_is_lens ? true : last_arg;
    var id_lens = default_to_id ? new LId() : undefined;    
    
    lens = this;
    function lookup(prop) {
        return (prop in mapping) ? mapping[prop] :
               default_to_id ? id_lens :
               // args is saved copy of arguments above
               lens.error('property ' + prop + ' has no mapping', args);
    }
    
    this.get = function (c) {
        var o = {};
        
        for (var prop in c) {
            var l = lookup(prop);
            
            try {
                o[prop] = l.get(c[prop]);
            } catch (e) {
                throw this.wrap_exception(e).with_frame(this.name, l, 
                    'get on ' + prop + '; args shows lens used'); 
            }
        }
        
        return o;
    };
    this.putback = function (a, c) {
        var o = {};
        a = a || {};
        c = c || {};
        
        for (var prop in a) {
            var l = lookup(prop);
            
            try {
                o[prop] = l.putback(a[prop], c[prop]);
            } catch (e) {
                throw this.wrap_exception(e).with_frame(this.name, l,
                    'putback on ' + prop + '; args shows lens used');
            }
        }
        
        return o;
    };
    
    return this;
}
$L(LWmap, 'wmap');

/**
 * @class
 * Copies a concrete-tree property to a new, read-only property in the
 * abstract tree.  (The old property, orig, remains in the abstract tree.)
 *
 * @extends Lens
 * @param {String} orig The property to copy
 * @param {String} copy The new property to copy into
 * @see LMerge
 */
function LCopy(orig, copy) {
    this.name = 'copy';
    this.get = function (c) {
        // ??? allow undefined?    
    
        if (copy in c) {
            this.error(['get: couldn\'t copy ', orig, ' to ', copy, ' since ', copy,
                        ' already exists in ', c].join(''),
                       [orig, copy]);
        }

        // actually copy -- no sharing!
        var o = clone(c);
        // the if avoids creating objects like { copy: undefined } from {}
        if (o !== undefined && orig in o) { o[copy] = o[orig]; }
        
        return o;
    };
    this.putback = function (a, c) {
        a = a || {};
        
        var o = clone(a);
        if (o !== undefined && copy in o) { delete o[copy]; }
        
        return o; 
    };
    
    return this;
}
$L(LCopy, 'copy');

/**
 * @class
 * Merges two concrete-tree properties into a single abstract-tree property.
 * Preference is given to the first property listed, as: if the two properties
 * are equal in c during putback, then the putback value of n, the second
 * property, is equal to a.m, the first property in the abstract tree.  If,
 * on the other hand, m and n are different in c, than c.n is used.
 *
 * @extends Lens
 * @param {String} m The first, preferred, property to merge (from C)
 * @param {String} n The second property to merge (from C)
 * @see LCopy
 */
function LMerge(m, n) {
    this.name = 'merge';
    this.get = function (c) {
        c = c || {};
        
        var o = clone(c);        
        if (o !== undefined && n in c) { delete o[n]; }
        
        return o;
    };
    this.putback = function (a, c) {
        a = a || {};
        c = c || {};

        var o = clone(a);
        // we use ifs to prevent setting the property if a[m]/c[n] don't exist
        if (equal(c[m], c[n])) {
            if (m in a) { o[n] = a[m]; }
        } else {
            if (n in c) { o[n] = c[n]; }
        }
        
        return o;         
    };
    
    return this;
}
$L(LMerge, 'merge');

// OBJECT LENSES }}}

/*******************************
 * {{{ CONDITIONAL LENSES
 *******************************/

/**
 * @class
 * <p>Applies one of two lenses based on a predicate on the concrete tree. The
 * lens to apply on putback is selected by running the predicate on the
 * concrete tree again.  Thus is lens is unoblivious, viz. dependent on the
 * concrete tree during putback.</p>
 * <p>LCcond is typically applied for simple type dispatch; for more complex,
 * structure-dependent conditionals, {@link LAcond} or {@link LCond} may be
 * more appropriate.</p>
 *
 * @combinator
 * @extends Lens
 * @param {Predicate} p A predicate on the concrete tree (a function, list, 
 *     etc.)
 * @param {Lens} pass_lens The lens to run if p matches c
 * @param {Lens} fail_lens The lens to run if p does not match c
 * @see LAcond
 * @see LCond
 */
function LCcond(p, pass_lens, fail_lens) {
    p = new Predicate(p);

    this.name = 'ccond';

    this.clone = function () {
        var p_st = pass_lens.stateful();
        var f_st = fail_lens.stateful();
        var pc = p_st ? pass_lens.clone() : pass_lens;
        var fc = f_st ? fail_lens.clone() : fail_lens;
        
        var l = !(p_st || f_st) ? this : new LCcond(p, pc, fc);
        l.copy_bindings(this);
        return l;
    };
    this.for_each_sublens = function (f) {
        f(pass_lens);
        f(fail_lens);
    };
    
    this.get = function (c) {
        var matches = p.matches(c);
        
        try {
            return (matches ? pass_lens : fail_lens).get(c);
        } catch (e) {
            throw this.wrap_exception(e).with_frame(this.name,
                [p, pass_lens, fail_lens],
                'get: used the ' + (matches ? 'pass' : 'fail') + ' lens');
        }
    };
    this.putback = function (a, c) {
        var matches = p.matches(c);
        
        try {
            return (matches ? pass_lens : fail_lens).putback(a, c);
        } catch (e) {
            throw this.wrap_exception(e).with_frame(this.name,
                [p, pass_lens, fail_lens],
                'putback: used the ' + (matches ? 'pass' : 'fail') + ' lens');
        }
    };
    
    return this;
}
$L(LCcond, 'ccond');

/**
 * @class
 * <p>Applies one of two lenses based on predicates on the concrete and abstract
 * trees.  LAcond behaves like {@link LCcond}, only a separate predicate pa 
 * determines which lens to use during putback, making this lens (slightly)
 * more oblivious.</p>
 * <p>The lens is not oblivious because different lenses may be used for get 
 * and putback; if this is the case, then the undefined is given instead of c.
 * </p>
 * <p>LAcond is typically used to dispatch subtypes to appropriate lenses.  For
 *  an example, see {@link LRenameIfPresent}, which is essentially:</p>
 * <code>acond (function (c) { return has_prop(c, from); },
 *              function (a) { return has_prop(a, to); },
 *              new LRename(from, to),
 *              new LId())
 * </code>
 * <p>For simply dispatching, {@link LCcond} may be sufficient.</p>
 *
 * @combinator
 * @extends Lens
 * @param {Predicate} pc A predicate on the concrete tree
 * @param {Predicate} pa A predicate on the abstract tree
 * @param {Predicate} pass_lens Used for get when pc matches the concrete tree;
 *     used for putback when pa matches a
 * @param {Predicate} fail_lens Used for get when pc does not match the 
 *    concrete tree; used for putback when a does not match pa
 * @see LCcond
 * @see LCond
 */
function LAcond(pc, pa, pass_lens, fail_lens) {
    pc = new Predicate(pc);
    pa = new Predicate(pa);
    
    this.name = 'acond';
    
    this.clone = function () {
        var p_st = pass_lens.stateful();
        var f_st = fail_lens.stateful();
        var pcl = p_st ? pass_lens.clone() : pass_lens;
        var fcl = f_st ? fail_lens.clone() : fail_lens;
        
        var l = !(p_st || f_st) ? this : new LAcond(pc, pa, pcl, fcl);
        l.copy_bindings(this);
        return l;
    };
    this.for_each_sublens = function (f) {
        f(pass_lens);
        f(fail_lens);
    };
    
    this.get = function (c) {
        var matches = pc.matches(c);
        
        try {
            return (matches ? pass_lens : fail_lens).get(c);
        } catch (e) {
            throw this.wrap_exception(e).with_frame(this.name,
                [pc, pa, pass_lens, fail_lens],
                'get: used the ' + (matches ? 'pass' : 'fail') + ' lens');
        }
    };
    this.putback = function (a, c) {
        var matches_c = pc.matches(c);
        var matches_a = pa.matches(a);
        
        try {
            return (matches_a ?
                        pass_lens.putback(a, (matches_c ? c : undefined)) :
                        fail_lens.putback(a, (matches_c ? undefined : c)));
        } catch (e) {
            throw this.wrap_exception(e).with_frame(this.name,
                [pc, pa, pass_lens, fail_lens],
                'putback: used the ' +  (matches_a ? 'pass' : 'fail') + 
                ' lens with ' + (matches_c ? 'original tree' : 'undefined'));   
        }
    };
    
    return this;
}
$L(LAcond, 'acond');

/**
 * @class
 * Renames a property in the concrete tree to a different property in the 
 * abstract tree -- but only if the property is present.  This is a sample
 * use of {@link LAcond}.  Note that {@link LCcond} is insufficient to define
 * this lens, since the rename lens should be used for putback only if the 
 * new, renamed field is present in the abstract tree -- LCcond can only look
 * at the concrete tree.
 *
 * @extends Lens
 * @param {String} from The source property in the concrete tree
 * @param {String} to The target property in the abstract tree
 */
function LRenameIfPresent(from, to) {
    LStackMarker.call(this, new LAcond(function (c) { return has_prop(c, from); },
                                       function (a) { return has_prop(a, to); },
                                       new LRename(from, to),
                                       new LId()),
                      'rename_if_present');
    this.name = 'rename_if_present';
    
    return this;
}
$L(LRenameIfPresent, 'rename_if_present');

/**
 * @class
 * <p>The generalized conditional.  It combines elements of ccond and acond to
 * form a lens that offers complete control over dispatch, while maintaining
 * the lens laws.</p>
 * <p>It is necessary that for all possible inputs, either pa1 or pa2 is true.
 * It is perfectly acceptable for them both to be true, but at least one must
 * match.  In particular, pa1 should match on the image of pass_lens on inputs
 * matching pc; pa2 should match on the image of fail_lens on inputs which do
 * not match pc.</p>
 * <p>The conversion function, pass_to_fail and fail_to_pass, generalize the
 * behavior of {@link LCcond} and {@link LAcond}, as they allow values other
 * than undefined to be passed along if different lenses are used for get and
 * putback.</p>
 * <p>Note that LCcond(pc, pass_lens, fail_lens) = LCond(pc, ftrue, ftrue, 
 * fundef, fundef, pass_lens, fail_lens), where ftrue always returns true and
 * fundef always returns undefined.  Likewise, LAcond(pc, pa, pass_lens, 
 * fail_lens) = LCond(pc, pa, !pa, fundef, fundef, pass_lens, fail_lens), where
 * !pa returns the opposite of pa.</p>
 * 
 * @combinator
 * @extends Lens
 * @param {Predicate} pc The constant predicate; matches on get go through the
 *     pass_lens, failures go through the fail_lens
 * @param {Predicate} pa1 The pass_lens predicate.  If pa1 matches and pa2
 *     doesn't, then the pass_lens will always be used.  If pa1 passes on
 *     putback but pc didn't match on get, then pass_to_fail(c) will be used as
 *     the concrete putback argument instead of c.
 * @param {Predicate} pa2 The fail_lens predicate.  If pa2 matches and pa2
 *     doesn't, then the fail_lens will always be used.  If pa2 matches but pc
 *     didn't match during get, then fail_to_pass(c) will be used instead of c
 *     as the concrete putback argument.
 * @param {Function} pass_to_fail Called with c when c went through pass_lens
 *     during get but is going through fail_lens on putback.  Its result is 
 *     used instead of c.
 * @param {Function} fail_to_pass Called with c when c went through fail_lens
 *     during get put is going through pass_lens on putback.  Its result is
 *     used instead of c.
 * @param {Lens} pass_lens Used on get if pc matches; used on putback if pa1
 *     matches, or all three predicates -- pc, pa1, and pa2 -- all matched.
 * @param {Lens} fail_lens Used on get if pc doesn't match; used on putback if
 *     pa2 matches, or if pa1 and pa2 match and pc doesn't.
 * @see LCcond
 * @see LAcond
 */
function LCond(pc, pa1, pa2, pass_to_fail, fail_to_pass, pass_lens, fail_lens) {
    pc = new Predicate(pc);
    pa1 = new Predicate(pa1);
    pa2 = new Predicate(pa2);
    
    this.name = 'cond';
    
    this.clone = function () {
        var p_st = pass_lens.stateful();
        var f_st = fail_lens.stateful();
        var pcl = p_st ? pass_lens.clone() : pass_lens;
        var fcl = f_st ? fail_lens.clone() : fail_lens;
        
        var l = !(p_st || f_st) ? this : 
            new LCond(pc, pa1, pa2, pass_to_fail, fail_to_pass, pcl, fcl);
        l.copy_bindings(this);
        return l;
    };
    this.for_each_sublens = function (f) {
        f(pass_lens);
        f(fail_lens);
    };
    
    this.get = function (c) {
        var matches = pc.matches(c);
        
        try {
            return (matches ? pass_lens : fail_lens).get(c);
        } catch (e) {
            throw this.wrap_exception(e).with_frame(this.name,
                [pc, pa1, pa2, pass_to_fail, fail_to_pass, pass_lens, 
                 fail_lens],
                'get: used the ' + (matches ? 'pass' : 'fail') + ' lens');
        }
    };
    this.putback = function (a, c) {
        var matches_a1 = pa1.matches(a);
        var matches_a2 = pa2.matches(a);
        var matches_c = pc.matches(c);
        
        if (matches_a1 && matches_a2) {
            try {
                return (matches_c ? pass_lens : fail_lens).putback(a, c);
            } catch (e) {
                throw this.wrap_exception(e).with_frame(this.name,
                    [pc, pa1, pa2, pass_to_fail, fail_to_pass,
                     pass_lens, fail_lens],
                    'putback: used the ' + (matches_c ? 'pass' : 'fail') + 
                    ' lens');   
            }
        } else if (matches_a1) {
            try {
                return pass_lens.putback(a, 
                                         matches_c ? c : pass_to_fail(c));
            } catch (e) {
                throw this.wrap_exception(e).with_frame(this.name,
                    [pc, pa1, pa2, pass_to_fail, fail_to_pass,
                     pass_lens, fail_lens],
                    'putback: used the pass lens with ' + 
                    (matches_c ? 'original tree' : 'pass_to_fail'));
            }
        } else if (matches_a2) {
            try {
                return fail_lens.putback(a,
                                         matches_c ? fail_to_pass(c) : c);
            } catch (e) {
                throw this.wrap_exception(e).with_frame(this.name,
                    [pc, pa1, pa2, pass_to_fail, fail_to_pass,
                     pass_lens, fail_lens],
                    'putback: used the fail lens with ' +
                    (matches_c ? 'fail_to_pass' : 'original tree'));
            }
        } else {
            this.error('putback: neither predicate a1 nor a2 matched',
                       [pc, pa1, pa2, 
                        pass_to_fail, fail_to_pass,
                        pass_lens, fail_lens]);
        }
    };
    
    return this;
}
$L(LCond, 'cond');

//}}}

/*******************************
 * {{{ LIST/ARRAY LENSES
 *******************************/

/**
 * @class
 * Gets the first element of a list.
 *
 * @extends Lens
 * @param d The default rest-of-the-list to putback if c is undefined
 * @see LTail
 * @see LIndex
 */
function LHead(d) {
    this.name = 'head';
    this.get = function (c) {
        return c[0];
    };
    this.putback = function (a, c) { 
        var arr = clone(c || d);
        
        if (arr.length !== 0 || a !== undefined) {
            arr[0] = a;
        }
        
        return arr;
    };
    
    return this;
}
$L(LHead, 'head');

/**
 * @class
 * Gets the last element of a list.
 *
 * @extends Lens
 * @param d The default rest-of-the-list to putback if c is undefined
 * @see LHead
 * @see LIndex
 */
function LTail(d) {
    this.name = 'tail';
    this.get = function (c) {
        return c.length === 0 ? undefined : c[c.length - 1];
    };
    this.putback = function (a, c) {
        var arr = clone(c || d);

        // if the array is empty, but a isn't undefined, save it; otherwise, 
        // set the last index to a regardless
        if (arr.length === 0) {
            if (a !== undefined) { arr[0] = a; }
        } else {
            arr[arr.length - 1] = a;
        }
        
        return arr;
    };

    return this;
}
$L(LTail, 'tail');

/**
 * @class
 * Gets a specific index out of a list.
 *
 * @extends Lens
 * @param {int} idx The index to extract
 * @param d The default value to substitute for the rest of the list
 * @see LHead
 * @see LTail
 */
function LIndex(idx, d) {
    this.name = 'index';
    this.get = function (c) {
        // allow for undefined c
        c = c || [];
        return c[idx];
    };
    this.putback = function (a, c) {
        // we separate the clones in case c is a value, but of the wrong type
        // -- just being permissive
        var arr = clone(c || d);

        // we'll also only set the index if we'll actually do something...
        // overwriting a value with undefined is enough, but we'll avoid adding
        // sparse undefineds
        if (a !== undefined || idx in arr) { arr[idx] = a; }

        return arr;
    };
    
    return this;
}
$L(LIndex, 'index');

/**
 * @class
 * Gets the length of a list.  On putback, it configurably adds and deletes
 * elements from the list on putback.
 *
 * @extends Lens
 * @param {'beginning', 'end'} take_from Where to take elements from that would
 *     make the list too long.  The default is 'end'.
 * @param {'beginning', 'end'} add_to Where to add additional elements for
 *     compensatory lengthening; default is 'end'.  If take_from is specified
 *     but no value is given for add_to, then it defaults to take_from's value.
 * @param d The value to use during lengthening instead of undefined.
 */
function LLength(take_from, add_to, d) {
    take_from = take_from || 'end';
    add_to = add_to || take_from;
    
    this.name = 'length';
    this.get = function (c) { return c.length; };
    this.putback = function (a, c) {
        if (c.length == a) { return c; }

        var arr = clone(c);        
        // how many extra/missing elements?
        var diff = Math.abs(c.length - a);        
        
        if (c.length > a) {
            var start = 0;
            var finish = 0;
            
            // pick where to take from
            if (take_from == 'beginning') {
                finish = diff;
            } else { // take_from == 'end'
                start = a;
                finish = c.length;            
            }
            
            // cut out appropriately
            arr.splice(start, finish);
            return arr;
        } else {
            // build the new list
            var new_items = [];
            for (var i = 0;i < diff;i++) {
                new_items.push(clone(d)); // we clone to avoid sharing
            }
            
            // then concatenate the arrays
            return (add_to == 'beginning') ?
                new_items.concat(arr) :
                arr.concat(new_items);
        }
    };
    
    return this;
}
$L(LLength, 'list_length');

/**
 * @class
 * Turns an object into a list, given an order on the properties.  Every 
 * property of the object must appear, or its value will be dropped on putback.
 * Additionally, the list putback may have its values changed, but its length
 * must stay the same.
 *
 * @extends Lens
 */
function LOrder(/* prop1, prop2, ..., propn */) {
    var order = clone(arguments, true); // true -> copy as array
    
    this.name = 'order';
    this.get = function (c) {
//        if (c === undefined) { return undefined; }
        
        var o = [];
        var seen = {};
        
        for (var i = 0;i < order.length;i++) {
            var prop = order[i];
            
//            if (!(prop in c)) { this.error('get: missing property ' + prop + 
//                                           ' in order'); }
            
            o.push(prop in c ? c[prop] : undefined);
        }
        
        return o;
    };
    this.putback = function (a, c) {
//        if (a === undefined) { return undefined; }
        
        var o = {};
        
        if (order.length === 1 && !(a instanceof Array)) {
            a = [a];
        }
        
        if (a.length != order.length) {
            this.error('putback: different lengths', [order]);
        }
        
        for (var i = 0;i < order.length;i++) {
            var prop = order[i];
            
            if (i in a && a[i] !== undefined) {
                o[prop] = a[i];
            }
        }
        
        return o;
    };
    
    return this;
}
$L(LOrder, 'order');

/**
 * @class
 * Maps a function over a list, as {@link LMap} over an object.
 *
 * @combinator
 * @extends Lens
 * @param {Function} make_lens A function expecting add_before, add_after, and 
 *     del functions; it should produce a lens
 */
function LListMap(make_lens) {
    this.name = 'list_map';
    
    this.stateful = function () { return true; }
    
    function redisplay(f) {
        var bindings = this.bindings ? clone(this.bindings) : [];
        for (var i = 0;i < bindings.length;i++) {
            var binding = bindings[i];
            binding.putback();
            binding.get();
        }
    }
    var redisplay = closure(this, redisplay);
    
    // edit tracking
    var edits = [];
    this.add_child = function (i) {
        return function (v) {
            edits.push({ 'action': 'add', 'index': i, 'value': v });
            window.setTimeout(redisplay, 5);
        };
    };
    this.del_child = function (i) {
        return function () {
            edits.push({ 'action': 'del', 'index': i });
            window.setTimeout(redisplay, 5);
        };
    };
    
    // a master, by-index constructor to ensure that separate state is kept in
    // the sublens for each index
    var make_clone = is_lens(make_lens) ?
        function () { return make_lens.clone(); } : make_lens;
    this.clone_for_index = function (i) {
        var l = make_clone(this.add_child(i), this.add_child(i + 1), 
                           this.del_child(i));
        l.copy_bindings(this);
        return l;
    };
    // the by-index table for lenses
    var lenses = [];
    // looks up lenses in the table, and either makes a new one or returns the
    // saved lens
    this.lens_for_index = function (i) {
        if (i in lenses) { return lenses[i]; }
        
        var l = this.clone_for_index(i);
        lenses[i] = l;
        
        return l;
    };
    
    this.clone = function () { 
        var l = new LListMap(make_lens);
        l.copy_bindings(this);
        return l;
    };
    this.for_each_sublens = function (f) {
        for (var i = 0;i < lenses.length;i++) {
            var l = lenses[i];
            f(l);
        }
    }
    
    function grab_edits() {
        var locked_edits = [];
        while (edits.length > 0) {
            locked_edits.push(edits.shift());
        }
        
        return locked_edits;
    }
    
    this.get = function (c) {
        if (c === undefined) { return undefined; }
        
        var o = [];
        for (var i = 0;i < c.length;i++) {
            try {
                var l = this.lens_for_index(i);
                o.push(l.get(c[i]));
            } catch (e) {
                throw this.wrap_exception(e).with_frame(this.name, [make_lens],
                    'get on index ' + i);
            }
        }
        return o;
    };
    this.putback = function (a, c) {
        // copy and clear the edits into an immutable set
        var locked_edits = grab_edits();
        
        a = clone(a);
        if (!(a instanceof Array)) {
            a = [a];
        }
        
        c = clone(c);
        // only perform edits if putback will be defined...
        if (c !== undefined) {
            for (var i = 0;i < locked_edits.length;i++) {
                var edit = locked_edits[i];
                
                if (edit.action == 'add') {
                    // add the new value to the concrete tree and keep the
                    // list of lenses maintained -- add a new one, without state
                    c.splice(edit.index, 0, edit.value);
                    
                    /* BUG all lenses after thew newly spliced in lens have an index that is too high -- we need to lock to ensure that no events occur between now and the clearing out of the lenses
                    */
                    var l = this.clone_for_index(edit.index);
                    lenses.splice(edit.index, 0, l);
                    a.splice(edit.index, 0, l.get(edit.value));
                } else if (edit.action == 'del') {
                    // delete the old value from the concrete tree, as well as
                    // its lens
                    c.splice(edit.index, 1);
                    a.splice(edit.index, 1);
                    lenses.splice(edit.index, 1);
                } else {
                    this.error('putback: invalid action ' + edit.action,
                               [make_lens]);
                }
            }
        }
        
        if (c !== undefined && c.length !== 0 && a.length !== c.length) {
            this.error('putback: list lengths don\'t match after edits',
                       [make_lens]);
        }
        
        var o = [];
        for (i = 0;i < a.length;i++) {
            var a_i = a[i];
            var c_i = c === undefined || i > c.length ? undefined : c[i];
            
            try {
                var l = this.lens_for_index(i);
                var put = l.putback(a_i, c_i);
                o.push(put);
            } catch (e) {
                throw this.wrap_exception(e).with_frame(this.name, [make_lens],
                    'putback on index ' + i);
            }
        }
        /* if any changes were made to the number of lenses, we need to refresh all of the child lenses so they can regenerate with new links for their new indices
        */
        if (locked_edits.length > 0) {
            lenses = [];
            for (var i = 0;i < a.length;i++) {
                lenses.push(this.clone_for_index(i));
            }
        }
        
        return o;
    };
    
    return this;
}
$L(LListMap, 'list_map');

/**
 * @class
 * Rotates a list: on get, it puts the first element on the end.  On putback,
 * it puts the last element on the front.  This lens is defined only for
 * completeness' sake -- it is described in <i>Combinator for Bi-Directional
 * Tree Transformations</i> and used to define {@link LReverse}; we simply copy
 * the list and reverse it, so LRotate is unnecessary.
 *
 * @extends Lens
 */
function LRotate() {
    this.name = 'rotate';
    this.get = function (c) {
        var arr = clone(c);
        
        if (arr.length > 0) {
            // take the first element...
            var head = arr.shift();
        
            // ...and put it on the end
            arr.push(head);
        }
        
        return arr;
    };
    this.putback = function (a, c) {
        var arr = clone(a);
        
        if (arr.length > 0) { 
            // take the last element, if it's there...
            var tail = arr.pop();
            
            // ...and put it on the front
            arr.splice(0, 0, tail);
        }
        
        return arr;
    };
    
    return this;
}
$L(LRotate, 'rotate');

/**
 * @class
 * Reverses a list.
 *
 * @extends Lens
 */
function LReverse() {
    this.name = 'reverse';
    this.get = function (c) {
        var arr = clone(c);
        
        arr.reverse();
        
        return arr;
    };
    this.putback = function (a, c) {
        var arr = clone(a);
        
        arr.reverse();
        
        return arr;
    };
    
    return this;
}
$L(LReverse, 'reverse');

/**
 * @class
 * <p>Groups a list into sublists of size n, e.g. for n=2:</p>
 * <code>[1, 2, 3, 4] => [[1, 2], [3, 4]]<br />
 * [1, 2, 3, 4, 5] => [[1, 2], [3, 4], [5]]</code>
 *
 * @extends Lens
 * @param {int} n The size of groups to form
 * @see LConcat
 */
function LGroup(n) {
    this.name = 'group';
    this.get = function (c) {
        var arr = [];
            
        for (var i = 0, j = 0;i < c.length;i += n) {
            // grab n items if we can, but settle for the rest of the list
            var group = c.slice(i, Math.min(i + n, c.length));

            // then push the group on
            if (group.length !== 0) { arr.push(group); }
        }
        
        return arr;
    };
    this.putback = function (a, c) {
        var arr = [];
        
        for (var i = 0;i < a.length;i++) {
            // put everything back together
            arr = arr.concat(a[i]);
        }
        
        return arr;
    };
    
    return this;
}
$L(LGroup, 'group');

/**
 * @class
 * Concatenates sublists, separating them by a spacer.  This must be provided;
 * if an indistinguishable spacer is given, then everything will be putback
 * into the first list.  The argument is given as a list of lists, each of 
 * which will be concatenated into a single list, with spacer separating them.
 * This lens is somewhat the dual of {@link LGroup}.
 *
 * @extends Lens
 * @param spacer A distinguishable spacer, which separates the two lists
 */
function LConcat(spacer) {
    this.name = 'concat';
    this.get = function (c) { 
        var arr = [];
        for (var i = 0;i < c.length;i++) {
            arr = arr.concat(c[i]);

            // put on the spacer if we're not done            
            if (i != c.length - 1) {
                arr.push(clone(spacer)); // clone to avoid sharing
            }
        }

        
        return arr;
    };
    this.putback = function (a, c) {
        var arr = [];
        
        var sublist = [];
        for (var i = 0;i < a.length;i++) {
            var elem = a[i];
            if (!equal(elem, spacer)) {
                // if it's not a spacer, then it's part of a sublist
                sublist.push(elem);
            } else {
                // if it was a spacer, we need to save the old sublist and
                // start a new one
                arr.push(sublist);
                sublist = [];
            }
        }
        if (sublist.length !== 0) { arr.push(sublist); }
        
        return arr;
    };
        
    return this;
}
$L(LConcat, 'concat');

/**
 * @class
 * Filters a list, removing items that fail to matche a predicate.  Two 
 * predicates must be given in order for putback to work correctly: edits to
 * selected items should propagate appropriately.  This propagation is done on
 * a first-come, first-served basis -- the first item of the abstract tree 
 * replaces first item that matches pkeep in the concrete tree.  If there are
 * more items in the abstract tree than items that match pkeep, then the extra
 * items are added at the end.  If there are fewer items in a than those that
 * match pkeep in c, then the last items in c are deleted.
 *
 * @extends Lens
 * @param {Predicate} pkeep A predicate that matches the list-items to keep
 * @param {Predicate} plose A predicate that matches the list-items to filter
 */
function LListFilter(pkeep, plose) {
    pkeep = new Predicate(pkeep);
    plose = new Predicate(plose);
    
    this.name = 'filter';
    this.get = function (c) {
        var arr = [];
        
        for (var i = 0;i < c.length;i++) {
            // skip plose matches
            if (!plose.matches(c[i])) {
                arr.push(c[i]);
            }
        }
        
        return arr;
    };
    this.putback = function (a, c) {
        // arr starts out just like c
        var arr = clone(c);
        
        var a_i, c_i;
        for (a_i = 0, c_i = 0;c_i < c.length;c_i++) {
            // we update with the value from a if pkeep matches and there are
            // still value left
            if (pkeep.matches(arr[c_i]) && a_i < a.length) {
                arr[c_i] = a[a_i];
                a_i++; 
            }
        }
        
        // if there are more values in a than those that matched pkeep in c,
        // then we'll stick on the extras here
        if (a_i < a.length) {
            arr = arr.concat(a.slice(a_i, a.length));
        }
        
        return arr;
    };
    
    return this;
}
$L(LListFilter, 'list_filter');

// LIST/ARRAY LENSES }}}

/*******************************
 * {{{ COMPOSITE LENSES
 *******************************/

/**
 * @class
 * <p>A simple lens for laying properties out in the DOM while also inserting
 * constant, structural data.</p>
 * <p>Composes {@link LWmap}, chains of {@link LAdd}, and {@link LOrder}.
 * It takes arguments <tt>prop1, act1, prop2, act2, ..., [default_to_id]</tt>,
 * where <tt>propi</tt> is a valid JavaScript property name and <tt>acti</tt> is
 * either a lens or a DOM-displayable value.</p>
 * <p>The call to {@link LOrder} comes from the order of the properties; the
 * last lens in the composition is <tt>new LOrder(prop1, prop2, ...)</tt>.</p>
 * <p>The call to {@link LWmap} comes from the properties and lens actions; it
 * is the first call of the composition, <tt>new LWmap(propl1, actl1, ..., 
 * default_to_id)</tt>, where <tt>propl/actli</tt> are the properties and 
 * actions where the action is a lens, and default_to_id is the final argument
 * (which defaults to false).</p>
 * <p>The calls to {@link LAdd} come from the remaining properties; each
 * property/action pair is called <tt>new LAdd(propni, actni)</tt> and 
 * {@link LSeq}ed together.</p>
 * <p>TODO it should be possible to give 'false' or 'undefined' as the property
 * for non-lens actions, but that means generating non-clashing names.</p>
 *
 * @combinator
 * @extends Lens
 */
function LLayout(/* props1, act1, props2, act2, ..., default_to_id */) {
    // by default, default_to_id is false; here we check for it
    var has_default_arg = arguments.length % 2 === 1; 
    var default_to_id = has_default_arg && arguments[arguments.length - 1];
    // we precalculate the length of arguments, ignoring default_to_id if it was
    // provided
    var args_len = arguments.length - (has_default_arg ? 1 : 0);
    
    // stores the order given -- passes on to LOrder
    var order = [];
    // stores the lenses given -- passes on to LWmap
    var lenses = [];
    // stores the non-lenses given -- passes on to LAdd
    var adds = undefined;
    
    for (var i = 0;i < args_len;) {
        // propi, acti
        var prop = arguments[i++];
        var action = arguments[i++];
        
        // record the order property's position
        order.push(prop);
        
        if (is_lens(action)) {
            // we have a lens, so it's an argument for wmap
            // we'll call LWmap.apply(..., lenses), so we want it to be lined up
            // in the LWmap calling order: propi, lensi
            lenses.push(prop);
            lenses.push(new LStackMarker(action, 'order', 'running for ' + prop));
        } else {
            // we have a non-lens, so we'll add the constant to the tree
            var add = new LAdd(prop, action);
            
            if (adds === undefined) {
                // if we haven't seen any adds, remember this as our one add
                adds = add;
            } else {
                // otherwise, tack it on as the next one
                adds = new LSeq(adds, add);
            }
        }
    }
    
    // wmap take default_to_id as a parameter
    lenses.push(default_to_id);
    var wmp = lenses.length === 0 ? new LId() : LWmap.apply(new Lens(), lenses);
    var ord = LOrder.apply(new Lens(), order);
    
    if (adds) {
        // run wmap, then add the constants, and then order into a list
        LStackMarker.call(this, new LSeq(wmp, adds, ord), 'layout');
    } else {
        // no adds, so just call wmap and order
        LStackMarker.call(this, new LSeq(wmp, ord), 'layout', 'no adds');
    }
    
    this.name = 'layout';
    return this;
}
$L(LLayout, 'layout');

// COMPOSITE LENSES }}}

/*******************************
 * {{{ DOM LENSES
 *******************************/

/**
 * Turns an object into a displayable DOM element.  If the object is already
 * a DOM node, nothing is done.  Otherwise, a new text node is made out of the
 * given value.
 *
 * @param o The object to put into the dom
 * @return {DOM:element} A DOM-ified version of the object
 */
function domify(o) {                                                                                  
    if (dom_obj(o) || o instanceof Array) {
        return o;
    }                                                            

    return document.createTextNode(o);
}

/**
 * Turns objects into span elements with ids.
 *
 * @param o The object
 * @param id The id to use
 */
function nodify(o, id) {
    if (dom_obj(o)) {
        if (o.nodeType != Node.TEXT_NODE) {
            o = o.nodeValue;
        } else { 
            return o;
        }
    }
    
    return make_dom_node('span', { 'id': id }, [domify(o)]);
}

/**
 * Turns a DOM element into a JavaScript object -- as best it can.  This 
 * amounts to just turning text nodes into strings; beyond this, nothing
 * is really done.
 *
 * @param {DOM:node} e A DOM node
 * @return A JavaScript object version of e
 */
function jsify(e, orig) {
    // extract the text if we can...
    if (typeof e == 'object' && 'nodeType' in e && 
        e.nodeType == Node.TEXT_NODE) {
        return e.nodeValue;
    }
    
    // type coerce, if we can...
    if (e !== '' && !isNaN(Number(e)) ) {
        return Number(e);
    }
    
    // ...but just leave it as a node, otherwise
    return e;
}

/**
 * @class
 * Creates DOM text nodes on get.  For other nodes, see {@link LTag}.
 *
 * @extends Lens
 */
function LTextTag() {
    this.name = 'text_tag';
    this.get = function (c) {
        return document.createTextNode(c);
    };
    this.putback = function (a, c) {
        return a.nodeValue;
    };
    
    return this;
}
$L(LTextTag, 'text_tag');

/**
 * Creates a DOM node.
 *
 * @param {String} name The element name to create
 * @param attribs An object mapping attribute names to values; it is safe to
 *     treat event handlers as attributes (e.g., <tt>onclick</tt>)
 * @param {Array} children The list of child nodes
 */
function make_dom_node(name, attribs, children) {
    // create the node
    var node = document.createElement(name);
        
    // copy in attributes
    for (var attrib in attribs) {
        // event handlers need to be registered specially
        if (contains(dom_events, attrib)) {
            add_event_handler(node, attrib, attribs[attrib]);
        } else {
            node.setAttribute(attrib, attribs[attrib]);
        }
    }
        
    // copy in children
    children = children || [];
    for (var i = 0;i < children.length;i++) {
        // no need to clone the children here; they'll be cloned later if needed
        node.appendChild(domify(children[i]));
    }

    return node;
}

/**
 * @class
 * A DOM-element constructing lens for static DOM elements, such as br and hr.
 * In general, {@link LTag} should be used -- it will actually work with values
 * on get and putback.
 *
 * @extends Lens
 * @param {String} name The name of the element
 * @param d The default value to putback, if undefined was given
 * @param attribs The optional object describing the attributes of the element
 * @param children The optional list of children of the object
 * @param {Boolean} strict A false-by-default setting which, when enabled, will
 *     cause errors to be signalled on putback if the generated DOM node was
 *     changed.
 */
function LConstTag(name, d, attribs, children, strict) {
    attribs = attribs || {};
    children = children || [];
    
    function dom_node() {
        return make_dom_node(name, attribs, children);
    }
    
    this.name = 'constant_tag';
    this.get = function (c) {
        return dom_node();
    };
    this.putback = function (a, c) {
        if (strict !== false && !equal(a, dom_node())) {
            this.error("putback: HTML argument " + a +
                       " was edited away from the generated DOM node.",
                       [name, d, attribs, children, strict]);
        }
        else if (c === undefined) { return d; }
        else { return c; }
    };
    
    return this;
}
$L(LConstTag, 'constant_tag');

/**
 * @class
 * <p>A generalized DOM element maker for element tags; for text nodes, see
 * {@link LTextTag}.  LTag is rarely used directly, but instead forms the basis
 * of the DOM code.</p>
 * <p>The placement option is somewhat complicated.  It can be either a string
 * or an object.  If it is the string 'child' means that the concrete tree 
 * should be written as a child of the given node.  If it is any other string,
 * then that string is taken as the name of the attribute into which the 
 * concrete tree is to be written.  If placement isn't a string, it is taken to
 * be a 'placement mapping'.  A placement mapping's properties are like plain
 * string placements -- either 'child' or something else.  The value of these
 * properties are the properties of the concrete tree.  An example will make 
 * this clearer.</p>
 * <code> pm = { href: 'link', title: 'title', child: 'title' } </code>
 * <p>The above mapping will take a concrete tree with at least the properties
 * title and link, and create a node wherein the child node is c.text, the href
 * attribute c.href, and the title attribute is c.title.  On putback, the last
 * item in a mapping is what is written; in the example above, if the title
 * attribute is different from the child node, the child node is taken during
 * putback.  This is similar to the behavior of {@link LCopy}.</p>
 * <p>LTag is oblivious if placement is not a placement mapping.  If placement
 * is a placement mapping, then an implicit focus  
 *
 * @extends Lens
 * @param {String} name The name of the tag
 * @param {String} placement Either 'child', an attribute name, or a placement
 *     mapping -- this is where the concrete tree is written and whence the
 *     abstract tree is read; it defaults to 'child'.
 * @param {Object} attribs A property list of default attributes.  It defaults
 *     to {}.
 * @param {Array} children A list of default children; defaults to [].
 * @param {Boolean} implicit_focus When true, turns on an implicit focus lens
 *     on properties not mentioned in the property mapping.  This value 
 *     defaults to true, but has no effect if placement isn't a property
 *     mapping.
 */
function LTag(name, placement, attribs, children, implicit_focus) {
    placement = placement || 'child';
    attribs = attribs || {};
    children = children || [];
    implicit_focus = implicit_focus || true;
    
    var inverse_placement = {};
    if (implicit_focus && typeof placement == 'object') {
        for (var target in placement) {
            inverse_placement[placement[target]] = target;
        }
    }    
    
    this.name = 'tag';
    this.get = function (c) {
        var node_children = clone(children);
        var node_attribs = clone(attribs);
        
        if (placement == 'child') {
            if (c instanceof Array) {
                for (var i = 0;i < c.length;i++) {
                    node_children.push(domify(c[i]));
                }
            } else {
                node_children.push(domify(c));
            }
        } else if (typeof placement == 'object') {
            for (var target in placement) {
                var source = placement[target];
                if (target == 'child') {
                    node_children.push(c[source]);
                } else { // we need to write an attribute named 'target'
                    node_attribs[target] = c[source];
                }
            }
        } else { // placement is an attribute name
            node_attribs[placement] = c;
        }
        
        return make_dom_node(name, node_attribs, node_children);
    };
    this.putback = function (a, c) {
        if (placement == 'child') {
            if (a.childNodes.length > children.length + 1) {
                var a_children = a.childNodes;
                
                var arr = [];
                for (var i = children.length;i < a_children.length;i++) {
                    arr.push(jsify(a_children[i], c[i - children.length]));
                }
                
                return arr;
            } else {
                return jsify(a.lastChild, c);
            }
        } else if (typeof placement == 'object') {
            var o = {};
            
            for (var source in placement) {
                target = placement[source];
                
                if (source == 'child') {
                    if (a.childNodes.length !== 0) {
                        o[target] = jsify(a.lastChild, c[target]);
                    }
                } else if (source == 'value') {
                     if (a.value !== undefined) { 
                            o[target] = jsify(a.value, c[target]);
                     }
                } else { // source is an attribute name
                    if (a.hasAttribute(source)) {
                        o[target] = jsify(a.getAttribute(source), c[target]);
                    }
                } 
            }             
            
            if (implicit_focus) {
                for (var prop in c) {
                    if (!(prop in inverse_placement)) {
                        o[prop] = c[prop];
                    }
                }
            }
            
            return o;
        } else if (placement == 'value') {
            return jsify(a.value, c);
        } else { // placement is an attribute name
            return jsify(a.getAttribute(placement), c);
        }
    };    
    
    return this;
}
$L(LTag, 'tag');

/**
 * <p>Makes an {@link LTag}-derived lens.  Similar in spirit to
 * {@link #make_arith_lens}.  Given the name, it creates the {@link Lens}
 * constructor LNameTag and the lens function (a la {@link #make_lens_function})
 * name_tag.</p>
 * <p>The generated lenses take one of three calling conventions. Using LDivTag
 * as an example, a DIV lens can be created in the standard {@link LTag} way: 
 * <tt>new LDivTag({ id: 'foo' }, ['First child'])</tt>.  It may also be called
 * with an implicit {@link LLayout}: <tt>new LDivTag({ id: 'foo' }, 'lbl1',
 *'Foo: ', 'foo', new LPlus(5, 0), 'lbl2', 'Bar: ', 'bar', new LId())</tt>,
 * where the arguments to {@link LLayout} are all of those after the attribute
 * object.  The third calling convention uses an implicit {@link LSeq}, like so:
 * <tt>new LInputTag({ id: 'num' }, plus(5, 0))</tt>, where the value after the
 * attribute object is a lens.</p>
 * <p>Lenses with a placement of 'const' will use {@link LConstTag}, which
 * is a DOM-aware {@link LConst}.</p>
 *
 * @param {String} name The lens to create
 * @param {String} placement The default value for placement in
 *     {@link LTag}; should be either 'child', 'const', or an attribute name
 */
function make_tag_lens(name, placement) {
    var tag_name = name + "_tag";
    var f;
    
    if (placement == 'const') {
        f = function (d, attribs, children, strict) {
            LStackMarker.call(this,
                              new LConstTag(name, d, attribs, children, strict),
                              tag_name);
            this.name = tag_name;
            
            return this;
        };
    } else {
        f = function (attribs, children) {
            // figure out which calling convention we're in...
            var seq_mode = is_lens(children);
            var layout_mode = children !== undefined && 
                              !(children instanceof Array);

            if (seq_mode) {
                // LSeq calling convention
                LStackMarker.call(this, new LSeq(children, 
                                                 new LTag(name, placement, 
                                                          attribs)),
                                        tag_name, 'seq calling convention');
            } else if (layout_mode) {
                // LLayout calling convention
                var layout = clone(arguments, true).slice(1);
                LStackMarker.call(this, 
                                  new LSeq(LLayout.apply(new Lens(), layout),
                                           new LTag(name, placement, attribs)),
                                  tag_name, 'layout calling convention');
            } else {
                // LTag calling convention
                LStackMarker.call(this, 
                                  new LTag(name, placement, attribs, children),
                                  tag_name, 'tag calling convention');
            }
            this.name = tag_name;
                    
            return this;
        };
    }
    $L(f, tag_name);
    
    // publish
    var class_name = ["L", name[0].toUpperCase(), name.slice(1), "Tag"].
        join('');
    eval(class_name + " = f");
    
    return f;
} 

/**
 * Basis for the generation of tag lenses.  Tags under 'child' have the lens'
 * input sent to the last child node; 'const' lenses don't expect input; and
 * 'value' lenses put their input in the value attribute.
 */
var tag_schema = { 'child': ["a", "canvas", "div", "fieldset", "form", "h1",
                             "h2", "h3", "label", "legend", "li", "ol",
                             "optgroup", "p", "pre", "select", "span", "strong",
                             "table", "tbody", "td", "tfoot", "th",
                             "thead", "tr", "tt", "ul"],
                   'const': ["br", "hr"],
                   'value': ["button", "input"]
};

for (type in tag_schema) {
    tags = tag_schema[type];
    for (var i = 0;i < tags.length;i++) {
        make_tag_lens(tags[i], type);
    }
}

/**
 * @class
 * Creates a textarea on get and extracts the value on putback.  It is defined
 * specially so that browser inconsistencies in textareas can be handled
 * adequately.
 *
 * @extends Lens
 * @param {Object} attribs The attribute property list
 */
function LTextareaTag(attribs) {
    var get_tag = new LTag('textarea', 'child', attribs, []);
    var putback_tag = new LTag('textarea', 'value', attribs, []);
    
    this.name = 'textarea_tag';
    this.get = get_tag.get;
    this.putback = putback_tag.putback;
    
    return this;
}
$L(LTextareaTag, 'textarea_tag');

/**
 * @class
 * If given a primitive value on get, it will create an option with the 
 * concrete tree as both the value and the text.  If given an object o,
 * then o.value will be set as the value and o.text will be set as the text.
 * Whether an object or value is putback depends on what was given --
 * LOptionTag uses {@link LCcond}.
 *
 * @extends Lens
 * @param {Object} attribs A property list of default attributes.  It defaults
 *     to {}.
 * @param {Array} children A list of default children; defaults to [].
 */
function LOptionTag(attribs, children) {
    var tag = new LTag('option', { value: 'value', child: 'text' },
                       attribs, children);
    LStackMarker.call(this,
                      new LCcond(function (c) { return typeof c == 'object'; },
                                 tag,
                                 new LSeq(new LSeq(new LPlunge('text'), 
                                          new LCopy('text', 'value')),
                                 tag)),
                      'option_tag');
    this.name = 'option_tag';
    
    return this;
}
$L(LOptionTag, 'option_tag');

// DOM LENSES }}}

// LENSES }}}

/*******************************
 * {{{ DOM FUNCTIONS
 *******************************/

/**
 * List of all DOM event handler names.
 */
var dom_events = ['onblur', 'onfocus', 'oncontextmenu', 'onload', 'onresize',
                  'onscroll', 'onunload', 'onclick', 'ondblclick', 
                  'onmousedown', 'onmouseup', 'onmouseenter', 'onmouseleave',
                  'onmousemove', 'onmouseover', 'onmouseout', 'onchange',
                  'onreset', 'onselect', 'onsubmit', 'onkeydown', 'onkeyup',
                  'onkeypress', 'onabort', 'onerror'];

/**
 * Fixes copy errors introduced by {@link element#cloneNode}, e.g. failure to
 * copy classically-registered event handlers and the value property.
 *
 * @param {element} o The original DOM element
 * @param {element} copy The result of o.cloneNode()
 * @return {element} A modified copy with event handlers maintained
 */
function fix_dom_clone(o, copy) {
    for (var i = 0;i < dom_events.length;i++) {
        var event = dom_events[i];
        if (event in o) { copy[event] = o[event]; }
    }
    if ('value' in o) { copy.value = o.value; }
    
    // recur
    var o_kids = o.childNodes;
    var c_kids = copy.childNodes;
    for (i = 0;i < o_kids.length;i++) {
        fix_dom_clone(o_kids[i], c_kids[i]);
    }
}

/**
 * Gets a DOM object in a portable/intelligent way.  If the named object 
 * couldn't be found, then {@link #error} is called.
 *
 * @param {String} name The name of the DOM object; if name is already a DOM 
 *     object, then it is simply returned
 * @param {Boolean} strict Set to true to cause an error for failed lookups; the
 *     default is false
 * @return {DOM:element} The DOM element found 
 */
function get_dom_object(name, strict) {
    strict = strict || false;
    if (typeof name == 'object') { 
        return name; 
    }
    
    var o = document.getElementById ? document.getElementById(name) :
            document.all ? document.all[name] :
            document.layers ? document.layers[name] :
            strict ? error('get_dom_object', 'cannot access object ' + name) : 
                     undefined;
    
    if (!o) { 
        return strict ? error('get_dom_object',
                              'could not find object ' + name) : 
                        undefined; 
    }
        
    return o;
}

/**
 * Adds an event handler to a DOM node without replacing any existing handlers.
 * The user's handler will be called after all previous handlers, and its
 * return value will be propagated.  Credit must be given to
 * http://www.quirksmode.com for valuable browser information.
 *
 * @param {DOM:element} obj The DOM node
 * @param {String} event The event name (e.g. 'click') or moniker
 *     (e.g., 'onclick')
 * @param {Function} handler The handler to call; it will be passed the event
 *     object, and the 'this' object will be the DOM node on which the event
 *     occurred
 * @return {Function} The function that is actually registered on the event is
 *     returned; it performs some cross-browser maintenance before calling
 *     the given handler
 */
function add_event_handler(obj, event, handler) {
    // munge the event name into the registration name
    event = (event.slice(0, 2) == 'on') ? event : 'on' + event;
    
    // save the old handler
    var old = obj[event];
    obj[event] = function (e) {
        // handle cross-browser event funniness -- IE stores it in window.event
        if (!e) { e = window.event; }
        
        // call the old event handler
        if (old) { old.call(obj, e); }
        
        // and then have the new handler decide what happens
        return handler.call(obj, e);
    };
        
    return obj[event];
}

/**
 * A list of type values for input elements for which events should be caught.
 */
var input_nodes = ['text', 'password', 'checkbox', 'radio', 'file'];

/**
 * A predicate for DOM objects which are editable, and which events must be
 * caught for.  This is, in particular, input elements matching {@link 
 * #input_nodes}, the textarea element, and the select element.
 *
 * @param o Any object
 * @return {Boolean} True if o has a meaningful onchange event (while some
 *     browsers have mixed onchange implementations, this includes checkboxes
 *     and radio buttons)
 */
function is_editable(o) {
    if (!dom_obj(o)) { return false; }
    
    var node_name = o.nodeName.toLowerCase();
    if (node_name == 'textarea' ||
        node_name == 'select') { return true; }
    else if (node_name == 'input') {
        // default to type='text'
        if (!o.hasAttribute('type')) { return true; }
        
        // otherwise, see if it's the right kind
        var node_type = o.getAttribute('type');
        return contains(input_nodes, node_type);
    }

    return false;
}

/**
 * Recursively attaches events to a DOM object.
 *
 * @param {DOM:element} obj The DOM object
 * @param {Function} handler The event handler -- it will be passed the cross-
 *     browser event object
 */
function attach_handler(obj, handler) {
    if (!is_editable(obj)) {
        if (obj.childNodes) {
            var children = obj.childNodes;
            for (var i = 0;i < children.length;i++) {
                attach_handler(children[i], handler);
            }
        }
        return;
    }
    
    add_event_handler(obj, 'reset', handler);
    add_event_handler(obj, 'change', handler);
    
    var node_name = obj.nodeName.toLowerCase();
    // these guys work funny in some browsers...
    if (obj.hasAttribute('type')) {
        var type = obj.getAttribute('type');
        if (type == 'radio' || type == 'checkbox') {
            add_event_handler(obj, 'click', handler);
        } else if (type == 'text') {
            add_event_handler(obj, 'keypress', handler);
        }
    } else if (node_name == 'input' || node_name == 'textarea') {
        add_event_handler(obj, 'keypress', handler);
    }
}

/**
 * The registry of lens {@link Binding}s.
 */
var __bound_ids = {};

/**
 * @class
 * <p>A binding of a lens.  It records pertinent information, to allow for 
 * reflection on bindings.  Salient fields include:</p>
 * <table>
 * <tr><td>lens</td><td>The lens (without any DOM wrapping)</td></tr>
 * <tr><td>id</td><td>The DOM id bound to</td></tr>
 * <tr><td>last_model</td><td>The last model (concrete tree, in C) seen</td></tr>
 * <tr><td>poll_id</td><td>The interval id from window.setInterval controlling 
 *     polling (not necessarily set)</td></tr>
 * </table>
 * <p>It also has get and putback methods, like a {@link Lens}, but Binding is
 * not a traditional lens -- it will store and manage its own C and A values.
 * </p>
 *
 * @constructor
 * @param {Lens} lens The lens to bind
 * @param {String} id The DOM id to bind to
 * @param {Function} dom_update_callback A function to call when updates to the
 *     DOM cause a new model to be generated
 * @param {int} delay The amount of time to wait for "calm" (no putbacks) before
 *     running a putback.  The minimum is 5 milliseconds, which is necessary for
 *     DOM updates to propagate.
 */
function Binding(lens, dom_id, dom_update_callback, delay) {
    // make sure that the delay is valid
    delay = Number(delay);
    if (delay < 5 || isNaN(delay)) {
        delay = 5;
    }
    
    this.lens = lens;
    this.id = dom_id;
    
    var last_model = undefined;
    
    var dom_read = function () {
        return get_dom_object(dom_id);
    };
    
    var timeout = undefined;
    
    this.putback = function (a, c) {
        // clear the timeout -- if there's a putback pending, it'll just happen
        // now
        if (timeout) { 
            window.clearTimeout(timeout);
            timeout = undefined;
        }
        
        if (c !== undefined) { last_model = c; }
        
        // actually putback
        try {
            var new_model = jsify(lens.putback(dom_read(), last_model));
        } catch (e) {
            if (console) { console.log(e); } else { throw e; }
        }
        
        // only propagate new models
        if (!equal(new_model, last_model)) {
            last_model = new_model;
            if (dom_update_callback) { dom_update_callback(new_model); }
        }
    };
    
    this.get = function (c) {
        var old_dom = dom_read();

        // make sure it has a parent -- if not, the update will fail
        if (!has_prop(old_dom, 'parentNode')) {
            error('bind_lens', 'model_update_callback: DOM object has no parent');
        }
        
        // perform the lens' get operation -- we might need to use an old value
        // if we weren't passed anything
        if (arguments.length === 0) {
            c = last_model;
        } else {
            last_model = c;
        }
        
        try {
            var new_dom = lens.get(c);
        } catch (e) {
            if (console) { console.log(e); } else { throw e; }
        }
        
        // make sure the lens has appropriate output -- it musn't fail on 
        // putback.  the error behavior for the last two tests may be too strict
        if (!dom_obj(new_dom) || !('hasAttribute' in new_dom)) {
            // if the lens didn't produce a DOM object, just make a span...
            lens = new LSeq(lens, new LSpanTag({ 'id': dom_id }));
            new_dom = lens.get(c);
        } else if (!new_dom.hasAttribute('id')) {
            // the lens didn't set the id, so set it
            new_dom.setAttribute('id', dom_id);
        } else if (new_dom.getAttribute('id') !== dom_id) {
            // if the lens produced a DOM object with the wrong id, error
            error(['bind_lens',
                   'model_update_callback: lens produced DOM object ',
                   'with id ', new_dom.getAttribute(dom_id), ' instead of ',
                   dom_id].join(''));
        }
        
        /* we catch every useful edit event (excluding list edit events, which
           are dealt with in LListMap); every time an edit occurs (e.g. a key is
           pressed) a timeout is set.  if no edits occur before that timeout,
           then a putback occurs.  otherwise, we'll keep delaying the putback.
           this is CRITICAL for performance, particularly as the lenses get
           complex
           
           delay is set at a minimum of 5 milliseconds, since the DOM update
           needs to actually occur before we try to putback
        */
        var pb = closure(this, this.putback);
        attach_handler(new_dom, function () {
            if (timeout) { window.clearTimeout(timeout); }
            
            timeout = window.setTimeout(pb, delay);
            
            // bubble, don't capture
            return true; 
        });
        
        // update the DOM!
        old_dom.parentNode.replaceChild(new_dom, old_dom);
    };
    
    // notify the lens of the binding
    lens.bind(this);
    
    return this;
}

/**
 * <p>Binds a lens to a given id in the document.  It returns a callback that
 * notifies the lens binding of new model values; it takes an optional callback
 * to notify the caller of new model values due to DOM changes.</p>
 *
 * @param {Lens} lens The lens
 * @param {String} dom_id The id to bind to
 * @param {Function} dom_update_callback The callback to call when the DOM 
 *     changes to create a new model value; it will be called with the new value
 * @param {int} delay The number of milliseconds to wait for no putbacks to 
 *     occur before actually running a putback; the default is 250
 * @param {int} polling An optional argument setting the frequency in
 *     milliseconds to check for new DOM structure; the default is to not poll
 * @return {Function} A callback to provide the binding with new values
 * @see #unbind_lens
 * @see #bind_lens_to
 */
function bind_lens(lens, dom_id, dom_update_callback, delay, polling) {
    delay = delay || 250; // default delay, in ms
    polling = polling || false; // default timeout, in ms
    
    if (dom_id in __bound_ids) {
        error('bind_lens', dom_id + ' is already bound'); 
    }
    
    // create the binding
    var binding = new Binding(lens, dom_id, dom_update_callback, delay);
    __bound_ids[dom_id] = binding;
    
    // call dom_update every polling ms
    // we save the return value, which is the interval ID.  this way we can turn
    // it off, later in unbind_lens
    if (polling) {
        binding.poll_id = window.setInterval(function () {
            return binding.putback();
        }, polling); 
    }

    // eta expand to preserve 'this'
    return function (c) { return binding.get(c); };
}
Lens.prototype.bind_to = function (dom_id, dom_update_callback, 
                                   delay, polling) {
    return bind_lens(this, dom_id, dom_update_callback, delay, polling);
};

/**
 * Binds a lens to a Flapjax model, using {@link #bind_lens} and Flapjax 
 * functions.
 *
 * @param {Behaviour} model The Flapjax model
 * @param {Lens} lens The lens
 * @param {String} dom_id The id to bind to
 * @param {int} delay The number of milliseconds to wait for no putbacks to 
 *     occur before actually running a putback; the default is 250
 * @param {int} polling An optional argument setting the frequency in
 *     milliseconds to check for new DOM structure; the default is to not poll
 * @see #unbind_lens
 * @see #bind_lens
 */
function bind_lens_to(model, lens, dom_id, delay, polling) {
    var stamp = undefined;
    function dom_update(v) {
        model.sendPulse(v, function (p) { console.log(p); stamp = p.stamp; });
    }

    var model_update = bind_lens(lens, dom_id, dom_update, delay, polling);
    model_update(model.valueNow());
    
    fx.event_e([model.changes()],
               function (send, pulse) {
                   if (pulse.stamp !== stamp) {
                       model_update(pulse.value);
                   }
               });
}
Lens.prototype.bind_to_b = function (model, dom_id, delay, polling) {
    return bind_lens_to(model, this, dom_id, delay, polling);
};

/**
 * Unbinds a lens bound to the DOM id dom_id.  If none is bound, an error is
 * signalled.
 *
 * TODO get to work with {@link #bind_lens_to}
 *
 * @param {String} dom_id The DOM id to unbind
 * @return {Lens} The lens that was bound
 * @see #bind_lens
 */
function unbind_lens(dom_id) {
    if (!(dom_id in __bound_ids)) {
        error('unbind_lens', dom_id + ' is not bound');
    }
    
    binding = __bound_ids[dom_id];
    if ('poll_id' in binding) {
        // TODO clear DOM event registrations?
        window.clearInterval(binding.poll_id);
    }
    
    delete __bound_ids[dom_id];
    
    binding.lens.unbind(binding);
    
    return binding.lens;
}

// DOM FUNCTIONS }}}

/*******************************
 * {{{ EXPORTS
 *******************************/

var exports = { 
    'clone': clone,
    'equal': equal,
    'has_prop': has_prop,
    
    'get_dom_object': get_dom_object,
    'make_dom_node': make_dom_node,
    'dom_obj': dom_obj,
    'domify': domify,
    'jsify': jsify,
    'add_event_handler': add_event_handler,
    'attach_handler': attach_handler,
    
    'LensException': LensException,
    'throw_on_error': throw_on_error,
    'alert_on_error': alert_on_error,
    'debugger_on_error': debugger_on_error,
    'log_on_error': log_on_error,
    'error': error,
    'set_error_handler': set_error_handler,
    
    'Lens': Lens,
    'is_lens': is_lens,

    'model_b': model_b,
    'bind_lens_to': bind_lens_to,
    
    'bind_lens': bind_lens, 
    'unbind_lens': unbind_lens
};

// Collate export information from the lens registry
for (var name in __lenses) {
    exports[name] = __lenses[name].fun;
}

// Export identifiers to the global scope (note lack of 'var')
if (provideGlobal) {
    for (name in exports) {
        var cmd = ['window.', name, ' = exports.', name, ';',
                   name, ' = exports.', name].join('');
        eval(cmd);
    }
}

return exports;

// EXPORTS }}}

}

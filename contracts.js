// defineGlobals determines if the contract library functions should be exported
// to the top-level.  If suppressAlerts is true, contract violations are not
// reported in alert boxes.
function initContracts(defineGlobals /* default true */,
                       suppressAlerts /* default false */,
											 customBlameHandler /* none by default */) {

//{{{ Initialization

// We throw this exception when the arguments to a function in this library are
// incorrect.
var ContractArgsException = function(fn,args) {
	this.fn = fn;
	this.args = args;
};

ContractArgsException.prototype = new Object;

ContractArgsException.prototype.toString = function () {
	return('invalid arguments: ' + this.fn + '(' + commaSep(this.args) + ')');
};

//}}};
												 

//{{{ The contract object

// We represent our contracts as a pair of projections, as in ``Contracts as
// Pairs of Projections.''  However, we require that the predicate that
// determines the first-order properties of the projected value be explicitly
// specified.  This allows us to write and and or contracts.

/* Contract: (string->any->any)*(string->any->any)*string*(any->bool)*bool
 *           ->contract
 *
 * server:         An error projection that blames the value.
 * client:         An error projection that blames the context.
 * friendly:       A string describing the contract.
 * firstOrderPred: A predicate that performs the first-order tests of this
 *                 contract.  If a value satisfies this predicate, the contract
 *                 must accept the value as valid, until it discovers otherwise.
 * isFirstOrder:   True if the contract can immediately determine whether values
 *                 satisfy it with first-order tests.  This may be conservative,
 *                 hence it is always safe for this flag to be false.
 *
 * Returns a contract object.  Before you go writing contracts with this, think
 * about whether you really need to.  You're probably better off using a
 * standard constructor, such as flat and func.
 */
var Contract = function(server,client,friendly,firstOrderPred,isFirstOrder) {
	// safety
	if (!(server instanceof Function && client instanceof Function &&
		    typeof friendly == 'string' && firstOrderPred instanceof Function &&
	      typeof isFirstOrder == 'boolean')) {
		throw new ContractArgsException('Contract',arguments); 
	}
	
	this.server = server;
	this.client = client;
	this.friendly = friendly;
	this.firstOrderPred = firstOrderPred;
	this.isFirstOrder = isFirstOrder;
};

var getServer = function(ctc) { return ctc.server; };
var getClient = function(ctc) { return ctc.client; };
var getFriendly = function(ctc) { return ctc.friendly; };
var getFirstOrderPred = function(ctc) { return ctc.firstOrderPred; }
var getIsFirstOrder = function(ctc) { return ctc.isFirstOrder; }


/* guarded: contract*any*string*string->any
 *
 * Guards val with the contract, blaming pos if val errs and neg if the context 
 * errs.
 */
var guard = function(ctc,val,pos,neg) {
  var serverProj = ctc.server(pos);
	var clientProj = ctc.client(neg);
	return clientProj(serverProj(val));
}

/* guarded: contract*any->string*string->any */
var guarded = function(ctc,val) {
  return function(pos,neg) {
		return guard(ctc,val,pos,neg);
	}
};

//}}};

//{{{ Contract violations

// WARNING: Don't contruct this object directly.  Call blame instead, and have
// blame construct this object for you.  The representation of exceptions
// changes every week, as I discover better ways of getting a good error
// message across on different browsers.
var ContractViolationException = function(guilty,received,expected) {
	this.guilty = guilty;
	this.received = received;
	this.expected = expected;
};

ContractViolationException.prototype = new Object; // TODO: necessary?

// This verbose message appears in the Javascript console of Firefox.
ContractViolationException.prototype.toString = function() {
	var es = (this.expected instanceof Contract) ? this.expected.friendly 
	                                             : this.expected;
	
	return('"' + this.guilty + '" broke a contract. "' + es + 
	       '" was expected, but "' + this.received + '" was given.');
};

ContractViolationException.prototype.getSummary = function() {
	return(this.guilty + ' broke a contract.');
};

/* blame: string*any*(string or contract)*contract -> none
 *
 *   guilty:   the name of the guilty party.
 *   received: the value that caused the contract violation
 *   expected: either a string describing the violation, or the contract that
 *             was violated.
 *
 * This function throws a ContractViolationException, hence doesn't return
 * any value.
 */
var blame = function(guilty,received,expected) {
	if (!((typeof guilty == 'string') && 
	    ((expected instanceof Contract) || (typeof expected == 'string')))) {
		throw new ContractArgsException('blame',arguments);
	}
	
	if (customBlameHandler !== undefined) {
		return customBlameHandler(guilty,received,expected);
	}
	else {
		expected = // argument reassignment, not a global
			((expected instanceof Contract) &&  (expected.friendly !== undefined))
			? expected.friendly : expected;
		
		var e = new ContractViolationException(guilty,received,expected);
		
		if (!(suppressAlerts === true))
			alert(e.getSummary());
		
		throw e;
	}
}

//}}};

//{{{ Utilities

// Returns a comma-separated string representation of the elements of arr.
var commaSep = function(arr) { // unsafe
	var str = '';
	
	for (var i = 0; i < arr.length - 1; i++) {
		str = str + arr[i].toString() + ', ';
	}
	
	str = str + arr[arr.length - 1];
	return str;
} // commaSep

var id = function(x) { return x; }

var isInstanceof = function(o) { // unsafe
	return function(v) {
		return (v instanceof o);
	};
};

var foldl = function(f,acc, arr) { // unsafe
	for (var i = 0; i < arr.length; i++) {
		acc = f(acc,arr[i]);
  }
  return acc;
}

// The first n elements of the array
var take = function(array,n) { // unsafe
	var copy = new Array(n);
	for (var i = 0; i < n; i++) {
		copy[i] = array[i];
	}
	return copy;
}

// Drops the first n elements of the array.
var drop = function(array,n) { // unsafe
	var copy = new Array(array.length-n);
	for (var i=n; i < array.length; i++) {
		copy[i-n] = array[i];
	}
  return copy;
}

// Apply the function to each element of the array, returning a copy of the
// array.
var map = function(f,arr) { // unsafe
	var ret = new Array(arr.length);
	for (var i = 0; i < arr.length; i++) {
		ret[i] = f(arr[i]);
	}
	
	return ret;
}

// True if pred holds for all elements of the array.  Otherwise, false.
var andMap = function(pred,arr) { // unsafe
	for (var i = 0; i < arr.length; i++) {
		if (!(pred(arr[i])))
			return false;
	}
	
	return true;	
};

// True if pred holds for any element of the array.  Otherwise, false.
var orMap = function(pred,arr) { // unsafe
	for (var i = 0; i < arr.length; i++) {
		if (pred(arr[i]))
			return true;
	}
	
	return false;
}

// Applies f to pairs of values from arr1 and arr2, returning an array of 
// results
var zipWith = function(f,arr1,arr2) { // unsafe
	var arr3 = new Array(arr1.length);
	
	for (var i = 0; i < arr1.length; i++) {
		arr3[i] = f(arr1[i],arr2[i]);
	}
	
	return arr3;
};

var apply1 = function(f,x) { return (f,x); }

// Splits the array by the predicate.  Returns an object with two properties,
// left and right.  left is the array of elements that satisfy the predicate
// and right is the array of elements that do not.
var split = function(pred,arr) {
	var left = new Array;
	var right = new Array;
	for (var i = 0; i < arr.length; i++) {
		if (pred(arr[i])) { left.push(arr[i]); }
		else { right.push(arr[i]); }
	}
	
	return {left: left,right: right};
};

//}}};

//{{{ Core contract constructors

/* flat: (any->bool)*string->contract
 *
 *   pred:     the predicate that the values satisfy
 *   friendly: a human-readable name for the contract
 *
 * Returns a flat contract.
 */
var flat = function(pred,friendly) {
	if (!(pred instanceof Function && typeof friendly === 'string'))
		throw new ContractArgException('flat',arguments);
	
	var server = function(name) {
    return function(val) {
			if (pred(val) !== false) { 
				return val; 
			}
			else {
				blame(name,val,friendly); 
			}
		}
  };
	 
   var client = function(name) { return id; };
	 
   return new Contract(server,client,friendly,pred,true /* flat */);
} // var flat ...

/* func: contract*contract->contract
 *
 *   domain: A contract that takes an array of arguments.
 *   range:  An arbitrary contract on the range of the function.
 *
 * Returns a function contract.
 */
var func = function(domain,range) {
	if (!(domain instanceof Contract && range instanceof Contract)) // safety
		throw new ContractArgsException('func',arguments);
  
  var server = function(name) {
     var rng = range.server(name);
     var dom = domain.client(name);
     return function(val) {
			 if (val instanceof Function) {
				 return function() {
					 return rng(val.apply(this,dom(arguments)));
				 };
			 }
	 		else {
				// Blame 'name,' because 'val' is not a 'function.'
				blame(name,val,'function');  
			}
		} // return function(val)
	}; // var server = ...
	 
   var client = function(name) {
      var rng = range.client(name);
      var dom = domain.server(name);
      return function(val) {
				if (val instanceof Function) {
					return function() {
						return rng(val.apply(this,dom(arguments)));
					}
				}
				else { 
					return val; 
				} 
	 		} // return function(val)
	 }; // var client = ...
	 
   return new Contract(server,client,domain.friendly + ' -> ' + range.friendly,
	                     isInstanceof(Function),false);
} // function func ...

//}}};

//{{{ Additional contract constructors.
//    These contracts deal with variable-arity functions, etc.

var cInstanceof = function(type,name) {
	return flat(function (x) { return (x instanceof type); },
							name);
}

var cTypeof = function(type) {
	return flat(function(x) { return (typeof x === type); },
							type);
}

/* args: contract ... -> contract
 *
 * Constructs a contract for an array of N elements, where the ith element
 * must satisfy the ith contract.
 */
var args = function(/* variable arity */) {
  var contracts = arguments; // arguments is dynamically scoped
	
	if (!(andMap(isInstanceof(Contract),contracts))) { // safety
		throw new ContractArgsException('args',arguments);
	}
	
  // This is a first-order contract, only if the contracts on the elements are
	// first-order contracts.
	var firstOrder = andMap(getIsFirstOrder,contracts);
	
	var firstOrderPred = function(arr) {
		// TODO: Efficiency in the double-loop
		return (arr instanceof Array && 
		        arr.length === contracts.length &&
            andMap(zipWith(function(c,v) { return c.firstOrderPred(v); },
			                      contracts,arr)));
	};	
	
  var server = function(name) {
		return function(array) {
			if (contracts.length === array.length) {
				return (zipWith(function(c,v) { return c.server(name)(v); },
				                contracts,array));
			}
			else {
				blame(name,array,'exactly ' + contracts.length + ' arguments');
			}
		};
	}; // var server = ...
	
	var client = function(name) {
		return function(array) {
			if (array.length !== undefined) { 
				return (zipWith(function(c,v) { return c.client(name)(v); },
				                contracts,array));
			}
		  else {
				return array; 
			}
		};
	}; // var client = ...
	
	// The friendly name looks like: (arg0, arg1, ..., argN)
	var friendlyNames = map(function(ctc) { return ctc.friendly; },contracts);
	var friendly = '(' + commaSep(friendlyNames) + ')';
	
	return new Contract(server,client,friendly,firstOrderPred,firstOrder);
} // function args ...


/* varargs: contract ... -> contract
 *
 * Given N+1 contracts, constructs a contract that accepts arrays of length at
 * least N.  The first N contracts are applied to the first N elements. The
 * last contract is applied to the remaining elements.
 *
 * Use this constructor for variable-arity functions.
 */
var varargs = function(/* contracts */) {
	if (!(andMap(isInstanceof(Contract),arguments))) { // safety
			throw new ContractArgsException('varargs',arguments);
	}
	
	var opt = arguments[arguments.length-1];
	var req = take(arguments,arguments.length-1);
	
	var server = function(name) {
		return function(array) {
			// We don't check that it is an array, so that we can accept arguments.
			if (array.length >= req.length) {
				var cArray = new Array(array.length);
				for (var i = 0; i < array.length; i++) {
					if (i < req.length) { cArray[i] = req[i].server(name)(array[i]); }
					else { cArray[i] = opt.server(name)(array[i]); }
				} // for ...
				return cArray;
			}
			else {
				blame(name,array,'at least ' + req.length + ' arguments to varargs');
			}
		} // return function(array)
	} // var server = ...
	
	var client = function(name) {
		return function(array) {
			if (array.length >= req.length) {
				var cArray = new Array(array.length);
				for (var i = 0; i < array.length; i++) {
					if (i < req.length) { cArray[i] = req[i].server(name)(array[i]); }
					else { cArray[i] = opt.client(name)(array[i]); }
				} // for ...
				return array;
			}
			else {
				return array;
			}
		} // return function ...
	} // var client = ....
	
	// It looks like: (req0,req1,...,reqN,opt,...)
	var friendlyReq = map(function(ctc) { return ctc.friendly; },req);
	var friendly = '(' + commaSep(friendlyReq) + ',' + opt.friendly + ',...)';
	
	// TODO: Permit first-order contract
	return new Contract(server,client,friendly,isInstanceof(Array),false);
} // var varargs ...

/* cArrayof: contract -> contract
 *
 * Constructs a contract that accepts arrays of elements that satisfy ctc.
 *
 * If ctc is a first-order contract, the array contract is first-order as well.
 */
var cArrayof = function(ctc) {
	if (!(ctc instanceof Contract)) {
		throw new ContractArgsException('cArrayof',arguments);
	}
	
	var friendly = 'array of ' + ctc.friendly;
	
	var server = function(name) {
		return function(array) {
			if (array instanceof Array) {
				return map(function (e) { return ctc.server(name)(e); },array);
			}			
			else {
				blame(name,array,friendly);
			}
		};
	};
	
	var client = function(name) {
		return function(array) {
			if (array instanceof Array) {
				return map(function (e) { return ctc.client(name)(e); },array);
			}
			else {
				return array;
			}
		};
	};
	
	return new Contract(server,client,friendly,isInstanceof(Array),
	                    ctc.isFirstOrder);
}

//{{{ or and its supporting code.

// Helper for or.
var orFlat = function(flats,firstOrderPred,friendly) {
	var server = function(name) {
		return function(val) {
			for (var i = 0; i < flats.length; i++) {
				if (flats[i].firstOrderPred(val)) {
					return flats[i].server(name)(val);
				}
			} // for ...
			blame(name,val,friendly);
		};
	};
	
	var client = function(name) {
		return function(val) {
			for (var i = 0; i < flats.length; i++) {
				if (flats[i].firstOrderPred(val)) {
					return flats[i].client(name)(val);
				}
			} // for ...
			return val;
		};
	};
	
	return new Contract(server,client,friendly,firstOrderPred,true);
};

// Helper for or.
var orHo = function(flats,ho,firstOrderPred,friendly) {
	var server = function(name) {
		return function(val) {
			for (var i = 0; i < flats.length; i++) {
				if (flats[i].firstOrderPred(val)) {
					return flats[i].server(name)(val);
				}
			} // for ...
			if (ho.firstOrderPred(val)) {
				return ho.server(name)(val);
			}
			else {
				blame(name,val,friendly);
			}
		};
	};
	
	var client = function(name) {
		return function(val) {
			for (var i = 0; i < flats.length; i++) {
				if (flats[i].firstOrderPred(val)) {
					return flats[i].client(name)(val);
				}
			} // for ...
			if (ho.firstOrderPred(val)) {
				return ho.client(name)(val);
			}
			else {
				return val;
			}
		};
	};
	
	return new Contract(server,client,friendly,firstOrderPred,false);
};

/*
 * or: contract ... -> contract
 *
 * Given a sequence of contracts, constructs a contract that accepts values
 * that satisfy any one of the contracts.
 *
 * Upto one of the contracts may be a higher-order contract.  If there are more,
 * an exception is raised.  The contract functions as follows.  It applies the
 * first-order predicates of the flat contracts, left to right.  The contract
 * applied is that associated with the first predicate that the value satisfies.
 * If none of the flat contract's predicates are satified, it tries the
 * predicate of the higher-order contract (if any).  If the predicate fails, the
 * contract is violated.  If the predicate holds, the higher-order contract is 
 * applied.
 */
var or = function() {
	// safety
	if (!(andMap(isInstanceof(Contract),arguments))) {
		throw('invalid arguments: or(' + commaSep(arguments) + ')');
	}
	
	var contracts = arguments;
	
	var contractSplit = split(getIsFirstOrder,contracts);
	var flats = contractSplit.left;
	var hos = contractSplit.right;
	
	var firstOrderPred = function(v) {
		return orMap(function(p) { return p(v); },
		             map(getFirstOrderPred,contracts));
	};
	
	var friendly = 'or(' + commaSep(map(getFriendly,contracts)) + ')';

	
	if (hos.length > 1) {
		throw('invalid arguments (multiple higher-order contracts): or(' +
		      commaSep(arguments) + ')');
	}
	else if (hos.length == 1) {
		return orHo(flats,hos[0],firstOrderPred,friendly);
	}
	else /* if (hos.length == 0) */ {
		return orFlat(flats,firstOrderPred,friendly);
	}
};
//}}};

//}}};

//{{{ Basic contracts.


var cNum      = cTypeof('number');
var cBool     = cTypeof('boolean');
var cString   = cTypeof('string');
var cFunction = cInstanceof(Function,'any function'); // first-order test only
var cAny      = flat(function () { return true; },'any');
var cArray    = cInstanceof(Array,'array');

//}}};

//{{{ Dead code for now.  Contracts on objects will be added very shortly, gotta
//    do a little internal testing first.

/*
///////////////////////////////////////////////////////////////////////////////
// Contracts on objects                                                      //
///////////////////////////////////////////////////////////////////////////////

// Creates a metfuncd with the specified pre and post conditions.
function methodContract(metfuncd,pre,post) {
   metfuncd.pre = pre;
   metfuncd.post = post;
}

function applyContract(m,object,prop) {
   object.prototype[prop] = function () {
      guard(arguments.callee.pre,arguments,"+ve","-ve");
      
      var result = m.apply(this,arguments);
      return guard(arguments.callee.post,result,"-ve","+ve");
   }
   object.prototype[prop].pre = m.pre;
   object.prototype[prop].post = m.post;
}

// Given the name of an object and its proto
function initObjectContracts(object) {
   for (var prop in object.prototype) {
      var m = object.prototype[prop];
      // LAME: If the metfuncd m has no properties, attempting to reference the
      // pre and post properties raises an exception.  However, if m has any
      // other properties, referencing pre and post returns undefined.
      if (m && m.pre && m.post) {
	 // We cannot close over the iterated values m and prop, since they
	 // are mutated.  Hence, we need to lift the real work to another
	 // function.  Tail recursion?
	 applyContract(m,object,prop);

      }
   }
}*/

//}}};

//{{{ Exports

var exports = {
	Contract: Contract,
	ContractViolationException: ContractViolationException,
	ContractArgsException: ContractArgsException,
	flat: flat,
	func: func,
	args: args,
	varargs: varargs,
	or: or,
	guarded: guarded,
	guard: guard,
	cInstanceof: cInstanceof,
	cTypeof: cTypeof,
	cNum: cNum,
	cBool: cBool,
	cString: cString,
	cFunction: cFunction,
	cAny: cAny,
	cArrayof: cArrayof,
	cArray: cArray
};

// Use JavaScript's silly technique of defining program global variables to
// globally declare names, only if requested.
if (defineGlobals !== false) {
	for (var v in exports) {
		// TODO: This may only work in Mozilla.  I was getting wierd errors using
		// Leo's code off the shelf.  But then, Leo's code erreneously exports
		// everything.
		eval('window.' + v + ' = exports.' + v + ';');
	}
}

return exports;

//}}};

} // function initContracts ...
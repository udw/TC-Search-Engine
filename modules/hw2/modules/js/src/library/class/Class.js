/*
 * Copyright (C) 2007 - 2014 Hyperweb2 All rights reserved.
 * GNU General Public License version 3; see www.hyperweb2.com/terms/
 */

'use strict';

hw2.include([
    'hw2!{PATH_CORE}modules/js/modules/weakmap/index.js'
]).define(function () {
    var $ = this;

    /*
     * 
     * SHARED BETWEEN CLASSES
     */

    function __SharedDelegator () {
    }


    function __createStorage (creator) {
        var storage = new WeakMap();
        creator = typeof creator === 'function' ? creator : Object.create.bind(null, null, {});
        return function store (o, v) {
            if (v) {
                storage.set(o, v);
            } else {
                v = storage.get(o);
                if (!v) {
                    storage.set(o, v = creator(o));
                }
            }
            return v;
        };
    }

    // for static and traits
    function __inherit (src, dest, isBase, __define) {
        var extend = function (destination, source, isBase) {
            var properties = isBase ? Object.getOwnPropertyNames(source) : source;

            for (var prop in properties) {
                var p = isBase ? properties[prop] : prop;

                if ((p.indexOf("__") !== 0) // exclude Class magic methods
                    && p !== "prototype") {
                    if (isBase) {
                        var d = Object.getOwnPropertyDescriptor(source, p);
                        var dd=Object.getOwnPropertyDescriptor(destination, p);
                        if (dd && dd.configurable == false) {
                            // skip reserved properties
                            continue;
                        }

                        Object.defineProperty(destination, p, d);
                    } else {
                        // traits don't have proper scope, so we must use 
                        // destination as scoping object
                        __define(p, source[p], null, null, destination);
                    }
                }
            }
        };

        if (isBase) {
            extend(dest, src, true);

            __define("__parent", src, "private static final", null, dest);
        } else {
            // traits
            if (src instanceof Array) {
                src.forEach(function (t) {
                    extend(dest, t, false);
                    extend(dest.prototype, t.prototype, false);
                });
            } else {
                extend(dest, src, false);
                extend(dest.prototype, src.prototype, false);
            }
        }

    }

    var __caller = null;

    // Functions within the closure can only be accessed by other functions
    // within the closure (this is the standard way of doing private methods)

    // This function checks whether the calling method belongs to a certain
    // class (i.e. whether it is contained within the class's prototype object
    // For protected fields, the prototype of the calling object's constructor is passed.
    // "alt" parameter could be used to check the static properties too
    function __checkAccess (scope, alt) {
        // If access attempted in global context, caller may be null
        if (!__caller) {
            return false;
        }

        // Implemented methods have an _name property set.
        var name = __caller._name;

        var prop = (scope && name in scope && scope[name]) || (alt && name in alt && alt[name]);

        // compare the prototype of caller and scope property
        if (Object.getPrototypeOf(__caller) === Object.getPrototypeOf(prop))
            return true;

        return false;
    }

    function __assertAccess (scope, alt) {
        if (!__checkAccess(scope, alt))
            throw new Error("Cannot access protected property");
    }

    /**
     *
     * @param {Object} descriptor elements:
     * type {Array of Strings / String} -> final / abstract modifier 
     * class {String} -> name of class ( not implemented yet, use var best alternative )
     * base {Object} -> the prototype of parent class
     * use {Array} -> class or classes for code reusing
     * members {Array of Object} -> associative array of members to add
     * @returns {_Class}
     */
    $.Class = function (descriptor) {

        // static "hard" map
        var __staticMembers = {
            priv: {}
        };

        var __pendingInst = {};

        function __Class () {
            function __PvDelegator () {
            }

            var __Object = null;
            var __base = null;

            if (typeof descriptor == "function") {
                // if descriptor is a function then we're wrapping an non-framework "class"
                __Object = descriptor;

                __Object.constructor = function () {
                    return __constructor(this, arguments);
                };
            } else {

                __Object = function () {
                    return __constructor(this, arguments);
                };

                /**
                 * Extends base ( prototype only, static methods are inherited below )
                 */
                if (descriptor) {
                    if (descriptor.type && typeof descriptor.type === "string")
                        descriptor.type = descriptor.type.split(" ");

                    if (descriptor.type) {
                        if (descriptor.type.indexOf("abstract") >= 0)
                            Object.defineProperty(__Object, "__isAbstract", {
                                value: true,
                                writable: false,
                                configurable: false,
                                enumerable: true
                            });

                        if (descriptor.type.indexOf("static") >= 0) {
                            Object.defineProperty(__Object, "__isStatic", {
                                value: true,
                                writable: false,
                                configurable: false,
                                enumerable: true
                            });
                        }

                        if (descriptor.type.indexOf("final") >= 0) {
                            Object.defineProperty(__Object, "__isFinal", {
                                value: true,
                                writable: false,
                                configurable: false,
                                enumerable: true
                            });
                        }
                    }


                    if (descriptor.base) {
                        if (typeof descriptor.base != "function")
                            throw new Error("Not valid class to extends!");

                        // if you are extending a "native class" then wrap it before
                        if (!descriptor.base.__isClass)
                            descriptor.base = $.Class(descriptor.base);

                        if (descriptor.base.__isFinal)
                            throw Error("final class cannot be extended!");

                        __Object.prototype = Object.create(descriptor.base.prototype);

                        __base = descriptor.base;
                    }
                }
            }

            var __proto = __Object.prototype;

            // Weak Map for instanced
            var __instMembers = {
                priv: __createStorage()
            };

            /**
             * Destroy the object ( private method )
             */
            function __destructor () {
                //delete this.__proto__;

                // destroy the rest of chain
                this.__parent && this.__parent.__destructor();

                return this; // return this to be combined with delete: delete myObj.__destruct();
            }

            function __constructor (scope, args) {
                var isPvCall = __caller != null;

                var absInit = false;

                if (__Object.__isStatic) {
                    throw new Error('Static class may not be instantiated');
                }


                if (scope.__root) {
                    var obj = scope.__root;
                } else {
                    var obj = Object.create(__proto);
                    scope.__root = obj; // store the root scope
                }

                if (__Object.__isAbstract) {
                    // if also the "root" object is abstract, then throw an error
                    if (scope.__root.__st.__isAbstract) {
                        throw new Error('Abstract class may not be constructed');
                    } else {
                        absInit = true;
                    }
                }

                obj.__root = scope.__root;

                var destructor = null;

                for (var prop in __pendingInst) {
                    var m = __pendingInst[prop];

                    // check for private constructor
                    switch (prop) {
                        case "__construct":
                            if (m.attributes.indexOf("private") >= 0 && !isPvCall)
                                throw new Error('Class with private constructor may not be instantiated');
                            break;
                        case "__destruct":
                            destructor = m;
                            continue;
                    }

                    __define(prop, m.val, m.attributes, m.retType, obj);
                }

                // also base must be instantiated
                if (__base) {
                    __define("__parent", __base.apply({__pvFlag: true, __root: obj.__root}, args),
                        "private final", null, obj);
                }

                /**
                 * define destructor
                 */
                if (!obj["__destruct"] || destructor) {
                    destructor || (destructor = {
                        val: function () {
                        },
                        attributes: ["public"]
                    });

                    // destruct workflow must be defined during
                    // instance building
                    var d = destructor.val;
                    var dt = function () {
                        d && d.call(this);
                        // after __destruct methods are casted
                        // we need to call the private one
                        __destructor.call(this);
                    };
                    // duck punching __destruct
                    __define("__destruct", dt, destructor.attributes, destructor.retType, obj);
                }

                /*
                 * Constructor
                 */

                var constructor = obj["__construct"] || (isPvCall ? __instMembers.priv(obj.__root)["__construct"] : undefined);
                // check __pvFlag to avoid calling parent constructor
                if (!scope.__pvFlag && constructor !== undefined) {
                    // call constructor
                    if (!absInit) {
                        constructor.apply(obj, args);
                    }
                }

                if (__Object.__isFinal) {
                    //Object.preventExtensions(Obj);
                    Object.seal(obj);
                }

                return obj;
            }

            /**
             *  Magic methods and properties
             */

            // dummy method for "duck type" checking
            Object.defineProperty(__proto, "__isClass", {value: function () {
                    return true;
                },
                enumerable: true
            });

            Object.defineProperty(__Object, "__isClass", {value: function (instance) {
                    return "__isClass" in instance;
                },
                enumerable: true
            });

            Object.defineProperty(__Object, "__isChildOf", {value: function (parent) {
                    return __proto instanceof parent;
                },
                enumerable: true
            });

            Object.defineProperty(__Object, "__getBase", {value: function (instance) {
                    return __base;
                },
                enumerable: true
            });

            Object.defineProperty(__Object, "__getProtected", {value: function () {
                    var publicCall = true;
                    // hidden argument for internal use
                    if (arguments[0] !== undefined && arguments[0] instanceof __Delegator)
                        publicCall = false;

                    for (var i = 0; i < elements.length; ++i) {
                        __define(elements[i]["name"] || elements[i]["n"],
                            typeof elements[i]["val"] === "undefined" ? elements[i]["v"] : elements[i]["val"],
                            elements[i]["attributes"] || elements[i]["a"],
                            elements[i]["retType"] || elements[i]["r"],
                            instance,
                            publicCall);
                    }
                },
                enumerable: true
            });


            Object.defineProperty(__Object, "__createInstance", {value: function () {
                    var Temp = function () {
                    }, inst, ret; // other vars

                    // Give the Temp constructor the Constructor's prototype
                    Temp.prototype = __Object;

                    // Create a new instance
                    inst = new Temp;

                    // Call the original Constructor with the temp
                    // instance as its context (i.e. its 'this' value)
                    ret = __Object.apply(inst, arguments);

                    // If an object has been returned then return it otherwise
                    // return the original instance.
                    // (consistent with behaviour of the new operator)
                    return Object(ret) === ret ? ret : inst;
                },
                enumerable: true
            });

            /**
             * expose the static public members to call directly from an instantiated object
             */
            Object.defineProperty(__proto, "__st", {
                value: __Object,
                enumerable: true
            });

            /**
             * Inherit methods from another class ( such as traits )
             */
            Object.defineProperty(__proto, "__inherit", {value: function (src) {
                    return __inherit(src, this, false);
                },
                enumerable: true
            });

            Object.defineProperty(__proto, "__addMembers", {value: function (elements) {
                    __Object.__addMembers(elements, this, arguments[1]);
                },
                enumerable: true
            });

            /**
             *
             * @param {type} elements
             * @param {type} instance (Optional) can be null if static member
             * @returns {undefined}
             */
            Object.defineProperty(__Object, "__addMembers", {value: function (elements, instance) {
                    var publicCall = true;
                    // hidden argument for internal use
                    if (arguments[2] !== undefined && arguments[2] instanceof __PvDelegator)
                        publicCall = false;

                    for (var i = 0; i < elements.length; ++i) {
                        __define(elements[i]["name"] || elements[i]["n"],
                            typeof elements[i]["val"] === "undefined" ? elements[i]["v"] : elements[i]["val"],
                            elements[i]["attributes"] || elements[i]["a"],
                            elements[i]["retType"] || elements[i]["r"],
                            instance,
                            publicCall);
                    }
                },
                enumerable: true
            });

            /**
             * Set a member to a defined Class, object or prototype
             * @param {type} name
             * @param {type} val
             * @param {String} attributes
             * public/private
             * static If no instance provided, this parameter will be forced.
             * final
             * @param {String} retType 
             * @param {type} instance -> will use instance instead of prototype with non static members
             * @param {String} isPubCall 
             * @returns Object
             */
            function __define (name, val, attributes, retType, instance, isPubCall) {
                if (typeof attributes === "string")
                    attributes = attributes.split(" ");

                // false if not specified, but if instance is not defined, it's forced to true
                var isStatic = attributes ? attributes.indexOf("static") >= 0 : false;

                if (__Object.__isStatic && !isStatic) {
                    throw new SyntaxError("You cannot add non-static members to a static class!");
                }

                var access = "public";
                if (attributes) {
                    access = attributes.indexOf("protected") >= 0 ?
                        "protected" :
                        (attributes.indexOf("private") >= 0 ?
                            "private" : access);
                }


                if (isPubCall && access !== "public") {
                    throw new Error("You cannot define a private/protected member outside of Class!");
                }

                // false if not specified
                var isFinal = attributes ? attributes.indexOf("final") >= 0 : false;

                // not implemented yet
                var isAbstract = attributes ? attributes.indexOf("abstract") >= 0 : false;

                if (isAbstract) {
                    throw new SyntaxError("abstract is not implemented yet! retry later/soon[tm]");
                }

                // with properties that need an instantiated object , we've to delegate the definition to the constructor
                if (!isStatic && !instance && (access === "private" || name === "__destruct")) {
                    __pendingInst[name] = {"val": val, "attributes": attributes, "retType": retType};
                    return;
                }

                var obj;

                switch (access) {
                    case "public": // OR
                    case "protected":
                        if (isStatic) {
                            obj = __Object;
                        } else if (typeof val === "function") {
                            obj = __proto;
                        } else {
                            obj = instance && instance.__root || __proto;
                        }
                        break;
                    case "private":
                        obj = isStatic && __staticMembers.priv || __instMembers.priv(instance.__root);
                        break;
                }

                // store parent object to apply next
                // we need to check both in public and in protected scopes
                // private avoided because we cannot "override" it
                // we need to check protected before 
                var old = obj[name];

                var getDescr = function (obj, name) {
                    var proto = obj.prototype || obj.__proto__;
                    return Object.getOwnPropertyDescriptor(obj, name)
                        || (proto && Object.getOwnPropertyDescriptor(proto, name));
                };

                if (old) {
                    // check for final members
                    var descr = getDescr(obj, name);
                    // we must check descr.set because if it's used then
                    // it's a variable with getter/setter and the check is done internally
                    if (descr && descr.set === undefined && descr.writable !== true) {
                        throw new SyntaxError("Final member '" + name + "' cannot be overridden");
                    }
                }

                var descriptors = {
                    //__proto__: !isStatic ? obj.__proto__ : obj,
                    configurable: !isFinal,
                    enumerable: access !== "protected"
                };

                if (typeof val !== "function" || val.__isClass) {
                    if (!retType && access !== "protected") {
                        descriptors.value = val;
                        descriptors.writable = !isFinal;
                    } else {
                        var checkAccess = function () {
                            var scope, alt;
                            if (isStatic) {
                                scope = __proto;
                                alt = this;
                            } else {
                                scope = this;
                                alt = this.__st;
                            }
                            access === "protected" && __assertAccess(scope, alt);
                        };

                        descriptors.get = function getter () {
                            checkAccess.call(this);
                            return val;
                        };

                        descriptors.set = function setter (newVal) {
                            if (isFinal)
                                return;

                            checkAccess.call(this);

                            // check if you're trying to set a new value
                            // that doesn't respect the typehinting rule
                            retType && $.typeCompare(retType, newVal);

                            // redefine only getter
                            descriptors.get = function () {
                                checkAccess.call(this);
                                return newVal;
                            };

                            // defineProperty redefines the variable
                            // on instance ( to avoid prototype modification )
                            // and without "recalling" the setter
                            Object.defineProperty(this, name, descriptors);
                        };
                    }
                } else {
                    descriptors.writable = !isFinal;

                    //var scope = null;
                    if (name === "__parent")
                        debugger;

                    var wrapper = function () {
                        var scope = {
                            s: this.__stScope || __Object,
                            _s: __staticMembers.priv
                        };

                        // expose private variable to internal class function
                        if (!isStatic) {
                            scope.i = this.__root || this.__scope.__root;
                            scope._i = __instMembers.priv(scope.i) || this._i /* alternative this._i for traits*/;

                            scope.__scope = scope._i.__scope = scope.i;
                        } else {
                            scope.__stScope = scope.s;
                        }

                        // as scope for __super we pass the base class environment
                        // TODO: however a check should be done when __super
                        // calls a trait method since we need
                        // current scope instead
                        var sBind = isStatic ? __base : scope;
                        Object.defineProperty(scope, "__super", {
                            value: old ? old.bind(sBind) : null,
                            writable: true,
                            configurable: true,
                            enumerable: true
                        });

                        Object.seal(scope); // this generates an error when we try to set something to scope object

                        access === "protected" && __assertAccess(scope.i || __proto, scope.s);


                        var prevCaller = __caller;
                        __caller = wrapper;
                        var r;
                        try {
                            r = val.apply(scope, arguments);
                        }
                        finally {
                            __caller = prevCaller;
                        }

                        if (retType)
                            $.typeCompare(retType, r);

                        return r;
                    };

                    wrapper.__getWrappedMethod = function (d) {
                        if (d instanceof __SharedDelegator) {
                            return val;
                        }
                        throw "Error: only the wrapping function may access the wrapped method";
                    };

                    if (val.__getWrappedMethod) {
                        val = val.__getWrappedMethod(new __SharedDelegator);
                    }

                    wrapper._name = name;

                    // alias for static
                    descriptors.value = wrapper;
                }

                return Object.defineProperty(obj, name, descriptors);
            }

            if (descriptor) {

                if (typeof descriptor == "function") {
                    // for wrapped class we've just to define the constructor
                    __define("__construct", descriptor, ["public"]);
                } else {
                    if (descriptor.base) {
                        //inherit static methods 
                        __inherit(descriptor.base, __Object, true, __define);
                    }

                    // Traits
                    // must be a non-empty array or function
                    if (descriptor.use && (!Array.isArray(descriptor.use) || descriptor.use.length > 0))
                        __inherit(descriptor.use, __Object, false, __define);

                    // finally add members
                    if (descriptor.members)
                        __Object.__addMembers(descriptor.members, null, new __PvDelegator);

                    __Object.constructor = __constructor;

                    if (__Object.__isFinal) {
                        //Object.preventExtensions(Obj);
                        Object.seal(__Object);
                    }

                    /*
                     * Create an object named by descriptor.class 
                     * inside namespace if defined, otherwise inside "this" scope
                     */
                    if (typeof descriptor.class === "string") {
                        var clScope = descriptor.namespace || this;
                        clScope[descriptor.class] = __Object;
                    }
                }
            }

            return __Object;
        }

        return new __Class();
    };
});


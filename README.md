# Emscripten Library Generator

This packages normal JavaScript libraries into emscripten's strange, undocumented library format. It automatically computes dependency and initialization information for global symbols in normal JavaScript code and prefixes all defined global symbols with an underscore to match emscripten's output. Top-level statements other than variable or function declarations are not supported (put initialization into a JavaScript function that is called as the first statement inside main() in C++).

Usage:

    npm install -g emscripten-library-generator
    emscripten-library-generator input1.js input2.js ... > output.js

Example input:

    var handles = {};
    function Foo(data) {
      this.data = data;
    }
    function Foo_new(ptr, data) {
      handles[ptr] = new Foo(data);
    }
    function Foo_delete(ptr) {
      delete handles[ptr];
    }

Example output:

    mergeInto(LibraryManager.library, {
        handles: '{}',
        Foo: function (data) {
            this.data = data;
        },
        Foo_new__deps: [
            'handles',
            'Foo'
        ],
        Foo_new: function (ptr, data) {
            _handles[ptr] = new _Foo(data);
        },
        Foo_delete__deps: ['handles'],
        Foo_delete: function (ptr) {
            delete _handles[ptr];
        }
    });

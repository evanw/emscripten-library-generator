# Emscripten Library Generator

This packages normal JavaScript libraries into emscripten's strange, undocumented library format which can be passed to the emscripten compiler with the `--js-library` flag. It can also be used to automatically populate the emscripten setting `EXPORTED_FUNCTIONS` using the `--unresolved` flag. It works by computing dependency and initialization information for global symbols and automatically prefixing all resolved global symbols with an underscore to match emscripten's output. Top-level statements other than variable or function declarations are not supported (put initialization into a JavaScript function that is called as the first statement inside main() in C++).

## Library Generation

Terminal commands:

    npm install -g emscripten-library-generator
    emscripten-library-generator input1.js input2.js ... > library.js

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
        handles: {},
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

Usage from C++:

    struct Foo;

    extern "C" {
      void Foo_new(Foo *foo, int data);
      void Foo_delete(Foo *foo);
    }
    
    struct Foo {
      Foo(int data) : _data(data) {
        Foo_new(this, data);
      }
      ~Foo() {
        Foo_delete(this);
      }
      
    private:
      int _data;
    };

## Unresolved Symbols

Finds all unresolved symbols that start with an underscore, which are assumed to be `extern "C"` functions in C++. If these symbol names are not specified, the emscripten compiler may omit those functions as dead code and JavaScript won't be able to access them.

Terminal commands (notice the `--unresolved` flag):

    npm install -g emscripten-library-generator
    emscripten-library-generator --unresolved input1.js input2.js ... > unresolved.json

Example input:

    var timeout = 0;
    function wait(value, delay) {
      if (timeout) {
        clearTimeout(timeout);
        _interrupted(value);
      }
      timeout = setTimeout(function() {
        _success(value);
        timeout = 0;
      }, delay);
    }

Example output:

    ["_interrupted","_success"]

Usage from C++:

    extern "C" {
      void wait(int value, int delay);

      void interrupted(int value) {
        printf("interrupted: %d\n", value);
      }

      void success(int value) {
        printf("success: %d\n", value);
      }
    }

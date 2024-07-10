Java.perform(function() {
    var webView = Java.use('android.webkit.WebView');
    var webSettings = Java.use('android.webkit.WebSettings');
    var JavascriptInterface = Java.use('android.webkit.JavascriptInterface');

    var addedInterfaces = [];

    webSettings.setJavaScriptEnabled.implementation = function(allow) {
        console.log('[!] JavaScript Enabled: ' + allow);
        return this.setJavaScriptEnabled(allow);
    }

    webView.addJavascriptInterface.implementation = function(object, name) {
        console.log('[i] JavaScript interface detected: ' + object.$className + ' instantiated as: ' + name);
        addedInterfaces.push(name);

        var interfaceClass = Java.use(object.$className);
        var methods = interfaceClass.class.getDeclaredMethods();
        methods.forEach(function(method) {
            var methodName = method.getName();
            if (method.isAnnotationPresent(JavascriptInterface.class)) {
                var overloads = interfaceClass[methodName].overloads;
                overloads.forEach(function(overload) {
                    overload.implementation = function() {
                        var args = [].slice.call(arguments);
                        console.log('[+] ' + name + '.' + methodName + ' called with args: ' + JSON.stringify(args));
                        var result = this[methodName].apply(this, arguments);
                        console.log('[+] ' + name + '.' + methodName + ' returned: ' + result);
                        return result;
                    };
                });
                console.log('[i] Hooked method: ' + name + '.' + methodName + ' (overloads: ' + overloads.length + ')');
            }
        });

        // Update the JSI list in Webview 
        var updateScript = "window.frida_interfaces = " + JSON.stringify(addedInterfaces) + ";";
        this.evaluateJavascript(updateScript, null);

        return this.addJavascriptInterface(object, name);
    }

    webView.evaluateJavascript.implementation = function(script, resultCallback) {
        console.log('WebView Client: ' + this.getWebViewClient());
        console.log('[i] evaluateJavascript called with script: ' + script);
        var result = this.evaluateJavascript(script, resultCallback);
        console.log('[i] evaluateJavascript result: ' + result);
        return result;
    }

    webView.removeJavascriptInterface.implementation = function(name) {
        console.log('The ' + name + ' JavaScript interface removed');
        var index = addedInterfaces.indexOf(name);
        if (index > -1) {
            addedInterfaces.splice(index, 1);
           // Update the JSI list in Webview 
            var updateScript = "window.frida_interfaces = " + JSON.stringify(addedInterfaces) + ";";
            this.evaluateJavascript(updateScript, null);
        }
        this.removeJavascriptInterface(name);
    }

    webView.loadUrl.overload('java.lang.String').implementation = function(url) {
        console.log('[i] WebView loading URL: ' + url);
        this.loadUrl(url);

        // Log all calls to JSI
        var js = `
            (function() {
                function wrapInterface(interfaceName) {
                    if (window[interfaceName]) {
                        for (var prop in window[interfaceName]) {
                            if (typeof window[interfaceName][prop] === 'function') {
                                var original = window[interfaceName][prop];
                                window[interfaceName][prop] = function() {
                                    console.log('JS called: ' + interfaceName + '.' + prop + ' with args: ' + JSON.stringify([].slice.call(arguments)));
                                    return original.apply(this, arguments);
                                };
                            }
                        }
                    }
                }

                var interfaces = window.frida_interfaces || [];
                interfaces.forEach(wrapInterface);
                
                var observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        if (mutation.type === 'childList') {
                            var newInterfaces = JSON.parse(mutation.target.textContent);
                            newInterfaces.forEach(wrapInterface);
                        }
                    });
                });

                var target = document.createElement('div');
                target.id = 'frida_interfaces_container';
                target.style.display = 'none';
                document.body.appendChild(target);

                observer.observe(target, { childList: true });

                Object.defineProperty(window, 'frida_interfaces', {
                    set: function(value) {
                        target.textContent = JSON.stringify(value);
                    },
                    get: function() {
                        return JSON.parse(target.textContent || '[]');
                    }
                });
            })();
        `;
        this.evaluateJavascript(js, null);
    }
});

var path = require('path');
var StringReplacePlugin = require("string-replace-webpack-plugin");

// If node-sass starts hanging, uncomment this line:
//process.env.UV_THREADPOOL_SIZE = 128;

function configureWebpack(terriaJSBasePath, config, devMode, hot, ExtractTextPlugin) {
    const cesiumDir = path.dirname(require.resolve('terriajs-cesium/package.json'));

    config.resolve = config.resolve || {};
    config.resolve.extensions = config.resolve.extensions || ['', '.webpack.js', '.web.js', '.js'];
    config.resolve.extensions.push('.jsx');
    config.resolve.alias = config.resolve.alias || {};

    config.module = config.module || {};
    config.module.loaders = config.module.loaders || [];

    config.module.loaders.push({
        test: /\.js?$/,
        include: path.dirname(require.resolve('terriajs-cesium')),
        exclude: [
            require.resolve('terriajs-cesium/Source/ThirdParty/zip'),
            require.resolve('terriajs-cesium/Source/Core/buildModuleUrl'),
            require.resolve('terriajs-cesium/Source/Core/TaskProcessor')
        ],
        loader: StringReplacePlugin.replace({
            replacements: [
                {
                    pattern: /buildModuleUrl\([\'|\"](.*)[\'|\"]\)/ig,
                    replacement: function (match, p1, offset, string) {
                        return "require('" + cesiumDir.replace(/\\/g, '\\\\') + "/Source/" + p1.replace(/\\/g, '\\\\') + "')";
                    }
                }
            ]
        })
    });

    config.module.loaders.push({
        test: /\.js?$/,
        include: require.resolve('terriajs-cesium/Source/ThirdParty/zip'),
        loader: StringReplacePlugin.replace({
            replacements: [
                {
                    pattern: /new Worker\(obj\.zip\.workerScriptsPath \+(.*)\)/ig,
                    replacement: function (match, p1, offset, string) {
                        return "require('" + require.resolve('worker-loader').replace(/\\/g, '\\\\') + "!" + cesiumDir.replace(/\\/g, '\\\\') + "/Source/ThirdParty/Workers/' + " + p1.replace(/\\/g, '\\\\') + ")()";
                    }
                }
            ]
        })
    });

    config.module.loaders.push({
        test: /\.js?$/,
        include: path.resolve(cesiumDir, 'Source', 'ThirdParty', 'Workers'),
        loader: StringReplacePlugin.replace({
            replacements: [
                {
                    pattern: "})(this)",
                    replacement: function (match, p1, offset, string) {
                        return "})(self)";
                    }
                }
            ]
        })
    });

    config.module.loaders.push({
        test: /\.js?$/,
        include: require.resolve('terriajs-cesium/Source/Core/TaskProcessor'),
        loader: StringReplacePlugin.replace({
            replacements: [
                {
                    pattern: /new Worker\(getBootstrapperUrl\(\)\)/ig,
                    replacement: function (match, p1, offset, string) {
                        return "require('" + require.resolve('worker-loader').replace(/\\/g, '\\\\') + "!" + require.resolve('../lib/cesiumWorkerBootstrapper').replace(/\\/g, '\\\\') + "')()";
                    }
                },
                {
                    pattern: "new Worker(getWorkerUrl('Workers/transferTypedArrayTest.js'))",
                    replacement: function (match, p1, offset, string) {
                        return "require('" + require.resolve('worker-loader').replace(/\\/g, '\\\\') + "!" + cesiumDir.replace(/\\/g, '\\\\') + "/Source/Workers/transferTypedArrayTest.js')()";
                    }
                }
            ]
        })
    });

    config.module.loaders.push({
        test: /\.js?$/,
        include: path.resolve(cesiumDir, 'Source', 'Workers'),
        loader: StringReplacePlugin.replace({
            replacements: [
                {
                    pattern: /require\(\'Workers\/\' \+ moduleName\)/ig,
                    replacement: function (match, p1, offset, string) {
                        return "require('./' + moduleName)";
                    }
                }
            ]
        })
    });

    // Use Babel to compile our JavaScript files.
    config.module.loaders.push({
        test: /\.jsx?$/,
        include: [
            path.resolve(terriaJSBasePath, 'lib'),
            path.resolve(terriaJSBasePath, 'test')
        ],
        loader: require.resolve('babel-loader'),
        query: {
            sourceMap: false, // generated sourcemaps are currently bad, see https://phabricator.babeljs.io/T7257
            presets: ['es2015', 'react'],
            plugins: [
                require.resolve('jsx-control-statements')
            ]
        }
    });

    //

    // Use the raw loader for our view HTML.  We don't use the html-loader because it
    // will doing things with images that we don't (currently) want.
    config.module.loaders.push({
        test: /\.html$/,
        include: path.resolve(terriaJSBasePath, 'lib', 'Views'),
        loader: require.resolve('raw-loader')
    });

    // Allow XML in the models directory to be required-in as a raw text.
    config.module.loaders.push({
        test: /\.xml$/,
        include: path.resolve(terriaJSBasePath, 'lib', 'Models'),
        loader: require.resolve('raw-loader')
    });

    config.module.loaders.push({
        test: /\.json|xml$/,
        loader: require.resolve('file-loader'),
        include: path.resolve(cesiumDir, 'Source', 'Assets')
    });

    config.module.loaders.push({
        test: /\/Workers\/$/,
        loader: require.resolve('file-loader'),
        include: cesiumDir
    });

    config.module.loaders.push({
        test: /\.json$/,
        include: [
            path.dirname(require.resolve('proj4/package.json')),
            path.dirname(require.resolve('ent/package.json')),
            path.dirname(require.resolve('entities/package.json'))
        ],
        loader: require.resolve('json-loader')
    });

    config.module.loaders.push({
        test: /\.js$/,
        include: path.resolve(path.dirname(require.resolve('terriajs-cesium/package.json')), 'Source'),
        loader: require.resolve('./removeCesiumDebugPragmas')
    });

    // Don't let Cesium's `buildModuleUrl` and `TaskProcessor` see require - only the AMD version is relevant.
    config.module.loaders.push({
        test: require.resolve('terriajs-cesium/Source/Core/buildModuleUrl'),
        loader: require.resolve('imports-loader') + '?require=>false'
    });

    config.module.loaders.push({
        test: /\.(png|jpg|svg|gif)$/,
        include: [
            path.resolve(cesiumDir, 'Source', 'Assets'),
            path.resolve(terriaJSBasePath, 'wwwroot', 'images')
        ],
        loader: require.resolve('url-loader'),
        query: {
            limit: 8192
        }
    });

    config.module.loaders.push({
        test: /\.woff(2)?(\?.+)?$/,
        include: path.resolve(terriaJSBasePath, 'wwwroot', 'fonts'),
        loader: require.resolve('url-loader'),
        query: {
            limit: 10000,
            mimetype: 'application/font-woff'
        }
    });

    config.module.loaders.push({
        test: /\.(ttf|eot|svg)(\?.+)?$/,
        include: path.resolve(terriaJSBasePath, 'wwwroot', 'fonts'),
        loader: require.resolve('file-loader')
    });

    config.devServer = config.devServer || {
        stats: 'minimal',
        port: 3003,
        contentBase: 'wwwroot/',
        proxy: {
            '*': {
                target: 'http://localhost:3001',
                bypass: function (req, res, proxyOptions) {
                    if (req.url.indexOf('/proxy') < 0 &&
                        req.url.indexOf('/proj4lookup') < 0 &&
                        req.url.indexOf('/convert') < 0 &&
                        req.url.indexOf('/proxyabledomains') < 0 &&
                        req.url.indexOf('/errorpage') < 0 &&
                        req.url.indexOf('/init') < 0) {
                        return req.originalUrl;
                    }
                }
            }
        },
    };

    config.plugins = (config.plugins || []).concat([
        new StringReplacePlugin()
    ]);

    if (hot) {
        config.module.loaders.push({
            include: path.resolve(terriaJSBasePath),
            test: /\.scss$/,
            loaders: [
                require.resolve('style-loader'),
                require.resolve('css-loader') + '?sourceMap&modules&camelCase&localIdentName=[name]__[local]&importLoaders=2',
                require.resolve('resolve-url-loader') + '?sourceMap',
                require.resolve('sass-loader') + '?sourceMap'
            ]
        });
    } else if (ExtractTextPlugin) {
        config.module.loaders.push({
            exclude: path.resolve(terriaJSBasePath, 'lib', 'Sass'),
            include: path.resolve(terriaJSBasePath, 'lib'),
            test: /\.scss$/,
            loader: ExtractTextPlugin.extract(
                require.resolve('css-loader') + '?sourceMap&modules&camelCase&localIdentName=[name]__[local]&importLoaders=2!' +
                require.resolve('resolve-url-loader') + '?sourceMap!' +
                require.resolve('sass-loader') + '?sourceMap',
                {
                    publicPath: ''
                }
            )
        });
    }

    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};
    config.resolve.alias['terriajs-variables'] = config.resolve.alias['terriajs-variables'] || require.resolve('../lib/Sass/global/_variables.scss');

    return config;
}

module.exports = configureWebpack;

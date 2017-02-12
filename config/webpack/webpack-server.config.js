/* eslint camelcase:0, global-require:0 */

'use strict';

const assert = require('assert');
const path = require('path');
const assign = require('lodash/assign');
const projectDir = path.resolve(`${__dirname}/../..`);

// Webpack plugins
const SvgStorePlugin = require('external-svg-sprite-loader/lib/SvgStorePlugin');
const NamedModulesPlugin = require('webpack/lib/NamedModulesPlugin');
const LoaderOptionsPlugin = require('webpack/lib/LoaderOptionsPlugin');
const NoEmitOnErrorsPlugin = require('webpack/lib/NoEmitOnErrorsPlugin');
const DefinePlugin = require('webpack/lib/DefinePlugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');

module.exports = (options) => {
    options = assign({ env: 'dev' }, options);
    options.build = options.build != null ? !!options.build : options.env !== 'dev';
    options.minify = options.minify != null ? !!options.minify : options.env !== 'dev';

    // Ensure that some options play well together
    options.env !== 'dev' && assert(options.build === true, `Option "build" must be enabled for env ${options.env}`);
    !options.build && assert(options.minify === false, `Option "minify" must be disabled when "build" is disabled for env ${options.env}`);

    const config = require(`${projectDir}/config/config-${options.env}`);

    return {
        // ---------------------------------------------------------
        // Webpack configuration
        // ---------------------------------------------------------
        context: projectDir,
        entry: {
            'server-renderer': [
                './src/server-renderer.js',
            ],
        },
        output: {
            path: `${projectDir}/web/build/`,
            publicPath: `${config.publicPath.replace(/\/+$/, '')}/`,
            filename: '[name].js',
            libraryTarget: 'this',
        },
        resolve: {
            alias: {
                config: `${projectDir}/config/config-${options.env}.js`,
                shared: `${projectDir}/src/shared`,
            },
        },
        module: {
            rules: [
                // Babel loader enables us to use new ECMA features + react's JSX
                {
                    test: /\.jsx?$/,
                    exclude: /node_modules/,
                    loader: 'babel-loader',
                    options: {
                        cacheDirectory: true,
                        presets: [
                            'es2015',
                            'stage-3',
                            'react',
                        ].filter((val) => val),
                        plugins: [
                            // Necessary for babel to run (replaces babel-polyfill)
                            'transform-runtime',
                            // Necessary for import() to work
                            'dynamic-import-node',
                            // Transforms that optimize build
                            options.build ? 'transform-react-remove-prop-types' : null,
                            options.build ? 'transform-react-constant-elements' : null,
                            options.build ? 'transform-react-inline-elements' : null,
                        ].filter((val) => val),
                    },
                },
                // CSS files loader which enables the use of postcss & cssnext
                {
                    test: /\.css$/,
                    loader: options.build ?
                        'skip-loader' :
                        ExtractTextPlugin.extract({
                            fallback: {
                                loader: 'style-loader',
                                options: {
                                    fixUrls: options.env === 'dev',
                                },
                            },
                            use: [
                                {
                                    loader: 'css-loader',
                                    options: {
                                        sourceMap: true,
                                        importLoaders: 1,
                                    },
                                },
                                {
                                    loader: 'postcss-loader',
                                    options: {
                                        plugins: [
                                            // Let postcss parse @import statements
                                            require('postcss-import')({
                                                // Any non-relative imports are resolved to this path
                                                path: './src/shared/styles/imports',
                                            }),
                                            // Add support for CSS mixins
                                            require('postcss-mixins'),
                                            // Add support for CSS variables using postcss-css-variables
                                            // instead of cssnext one, which is more powerful
                                            require('postcss-css-variables')(),
                                            // Use CSS next, disabling some features
                                            require('postcss-cssnext')({
                                                features: {
                                                    overflowWrap: true,
                                                    rem: false,               // Not necessary for our browser support
                                                    colorRgba: false,         // Not necessary for our browser support
                                                    customProperties: false,  // We are using postcss-css-variables instead
                                                    autoprefixer: {
                                                        browsers: ['last 2 versions', 'IE >= 11', 'android >= 4.4.4'],
                                                        remove: false, // No problem disabling, we use prefixes when really necessary
                                                    },
                                                },
                                            }),
                                        ],
                                    },
                                },
                            ],
                        }),
                },
                // Load SVG files and create an external sprite
                // While this has a lot of advantages, such as not blocking the initial load, it can't contain
                // inline SVGs, see: https://github.com/moxystudio/react-with-moxy/issues/6
                {
                    test: /\.svg$/,
                    exclude: [/\.inline\.svg$/, './src/shared/media/fonts'],
                    use: [
                        {
                            loader: 'external-svg-sprite-loader',
                            options: {
                                name: 'images/svg-sprite.[hash:15].svg',
                                prefix: 'svg',
                            },
                        },
                        'svg-css-modules-loader?transformId=true',
                    ],
                },
                // Loader for inline SVGs to support SVGs that do not integrate well with external-svg-sprite-loader,
                // see: https://github.com/moxystudio/react-with-moxy/issues/6
                {
                    test: /\.inline\.svg$/,
                    use: [
                        'raw-loader',
                        {
                            loader: 'svgo-loader',
                            options: {
                                plugins: [
                                    { removeTitle: true },
                                    { removeDimensions: true },
                                ],
                            },
                        },
                        'svg-css-modules-loader?transformId=true',
                    ],
                },
                // Raster images (png, jpg, etc)
                {
                    test: /\.(png|jpg|jpeg|gif)$/,
                    loader: 'file-loader',
                    options: {
                        emitFile: false,
                        name: 'images/[name].[hash:15].[ext]',
                    },
                },
                // Videos
                {
                    test: /\.(mp4|webm|ogg|ogv)$/,
                    loader: 'file-loader',
                    options: {
                        emitFile: false,
                        name: 'videos/[name].[hash:15].[ext]',
                    },
                },
                // Web fonts
                {
                    test: /\.(eot|ttf|woff|woff2)$/,
                    loader: 'file-loader',
                    options: {
                        emitFile: false,
                        name: 'fonts/[name].[hash:15].[ext]',
                    },
                },
                // Dependencies that do not work on server-side or are unnecessary for server-side rendering
                {
                    test: [
                        // require.resolve('some-module'),
                    ],
                    loader: 'skip-loader',
                },
            ],
        },
        plugins: [
            // Ensures that files with NO errors are produced
            new NoEmitOnErrorsPlugin(),
            // Configure debug & minimize
            new LoaderOptionsPlugin({
                minimize: options.minify,
                debug: options.env === 'dev',
            }),
            // Reduce react file size as well as other libraries
            new DefinePlugin({
                'process.env': {
                    NODE_ENV: `"${!options.build ? 'development' : 'production'}"`,
                },
                __CLIENT__: false,
                __SERVER__: true,
            }),
            // Enabling gives us better debugging output
            new NamedModulesPlugin(),
            // Alleviate cases where developers working on OSX, which does not follow strict path case sensitivity
            new CaseSensitivePathsPlugin(),
            // Move CSS styles to a separate file when NOT dev
            // At the moment we only generic a single app CSS file which is kind of bad, see: https://github.com/webpack-contrib/extract-text-webpack-plugin/issues/332
            !options.build && new ExtractTextPlugin({
                filename: 'app.[contenthash:15].css',
                allChunks: true,
            }),
            // External svg sprite plugin
            new SvgStorePlugin({ emit: false }),
        ].filter((val) => val),
        devtool: false,  // Not necessary because they are not supported in NodeJS (maybe they are?)
    };
};
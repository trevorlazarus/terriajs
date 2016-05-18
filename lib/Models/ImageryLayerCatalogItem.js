'use strict';

/*global require*/
var clone = require('terriajs-cesium/Source/Core/clone');
var DataSourceClock = require('terriajs-cesium/Source/DataSources/DataSourceClock');
var defaultValue = require('terriajs-cesium/Source/Core/defaultValue');
var defined = require('terriajs-cesium/Source/Core/defined');
var defineProperties = require('terriajs-cesium/Source/Core/defineProperties');
var DeveloperError = require('terriajs-cesium/Source/Core/DeveloperError');
var freezeObject = require('terriajs-cesium/Source/Core/freezeObject');
var JulianDate = require('terriajs-cesium/Source/Core/JulianDate');
var knockout = require('terriajs-cesium/Source/ThirdParty/knockout');
var TimeInterval = require('terriajs-cesium/Source/Core/TimeInterval');
var TimeIntervalCollection = require('terriajs-cesium/Source/Core/TimeIntervalCollection');

var CatalogItem = require('./CatalogItem');
var inherit = require('../Core/inherit');
var TerriaError = require('../Core/TerriaError');
var overrideProperty = require('../Core/overrideProperty');

/**
 * A {@link CatalogItem} that is added to the map as a rasterized imagery layer.
 *
 * @alias ImageryLayerCatalogItem
 * @constructor
 * @extends CatalogItem
 * @abstract
 *
 * @param {Terria} terria The Terria instance.
 */
var ImageryLayerCatalogItem = function(terria) {
     CatalogItem.call(this, terria);

    this._imageryLayer = undefined;
    this._clock = undefined;
    this._clockTickUnsubscribe = undefined;
    this._currentIntervalIndex = -1;
    this._nextIntervalIndex = undefined;
    this._nextLayer = undefined;

    /**
     * Gets or sets the opacity (alpha) of the data item, where 0.0 is fully transparent and 1.0 is
     * fully opaque.  This property is observable.
     * @type {Number}
     * @default 0.6
     */
    this.opacity = 0.6;

    /**
     * Gets or sets a value indicating whether a 404 response code when requesting a tile should be
     * treated as an error.  If false, 404s are assumed to just be missing tiles and need not be
     * reported to the user.
     * @type {Boolean}
     * @default false
     */
    this.treat404AsError = false;

    /**
     * Gets or sets a value indicating whether a 403 response code when requesting a tile should be
     * treated as an error.  If false, 403s are assumed to just be missing tiles and need not be
     * reported to the user.
     * @type {Boolean}
     * @default false
     */
    this.treat403AsError = true;

    /**
     * Gets or sets a value indicating whether non-specific (no HTTP status code) tile errors should be ignored. This is a
     * last resort, for dealing with odd cases such as data sources that return non-images (eg XML) with a 200 status code.
     * No error messages will be shown to the user.
     * @type {Boolean}
     * @default false
     */
    this.ignoreUnknownTileErrors = false;

    /**
     * Gets or sets the {@link TimeIntervalCollection} defining the intervals of distinct imagery.  If this catalog item
     * is not time-dynamic, property is undefined.  This property is observable.
     * @type {ImageryLayerInterval[]}
     * @default undefined
     */
    this.intervals = undefined;

    /**
     * Keeps the layer on top of all other imagery layers.  This property is observable.
     * @type {Boolean}
     * @default false
     */
    this.keepOnTop = false;

    /**
     * Gets or sets a value indicating whether this dataset should be clipped to the {@link CatalogItem#rectangle}.
     * If true, no part of the dataset will be displayed outside the rectangle.  This property is false by default because it requires
     * that the rectangle be highly accurate.  Also, many servers report an extent that does not take into account that the representation
     * of features sometimes require a larger spatial extent than the features themselves.  For example, if a point feature on the edge of
     * the extent is drawn as a circle with a radius of 5 pixels, half of that circle will be cut off.
     * @type {Boolean}
     * @default false
     */
    this.clipToRectangle = false;

    /**
     * Gets or sets a value indicating whether tiles of this catalog item are required to be loaded before terrain
     * tiles to which they're attached can be rendered.  This should usually be set to true for base layers and
     * false for all others.
     * @type {Boolean}
     * @default false
     */
    this.isRequiredForRendering = false;

    /**
     * Options for the value of the animation timeline at start. Valid options in config file are:
     *     initialTimeSource: "present"                            // closest to today's date
     *     initialTimeSource: "start"                              // start of time range of animation
     *     initialTimeSource: "end"                                // end of time range of animation
     *     initialTimeSource: An ISO8601 date e.g. "2015-08-08"    // specified date or nearest if date is outside range
     * @type {String}
     */
    this.initialTimeSource = undefined;

    knockout.track(this, ['_clock', 'opacity', 'treat404AsError', 'ignoreUnknownTileErrors', 'intervals', 'clipToRectangle']);

    overrideProperty(this, 'clock', {
        get : function() {
            var clock = this._clock;
            if (!clock && this.intervals && this.intervals.length > 0) {
                var startTime = this.intervals.start;
                var stopTime = this.intervals.stop;

                // Average about 5 seconds per interval.
                var totalDuration = JulianDate.secondsDifference(stopTime, startTime);
                var numIntervals = this.intervals.length;
                var averageDuration = totalDuration / numIntervals;
                var timePerSecond = averageDuration / 5;

                this._clock = new DataSourceClock();
                this._clock.startTime = startTime;
                this._clock.stopTime = stopTime;
                this._clock.multiplier = timePerSecond;

                _setClockCurrentTime(this);
            }
            return this._clock;
        },
        set : function(value) {
            this._clock = value;
        }
    });

    knockout.getObservable(this, 'opacity').subscribe(function(newValue) {
        updateOpacity(this);
    }, this);

    // Subscribe to isShown changing and add/remove the clock tick subscription as necessary.
    knockout.getObservable(this, 'isShown').subscribe(function() {
        updateClockSubscription(this);
    }, this);

    knockout.getObservable(this, 'clock').subscribe(function() {
        updateClockSubscription(this);
    }, this);
};

inherit(CatalogItem, ImageryLayerCatalogItem);

defineProperties(ImageryLayerCatalogItem.prototype, {
    /**
     * Gets a value indicating whether this {@link ImageryLayerCatalogItem} supports the {@link ImageryLayerCatalogItem#intervals}
     * property for configuring time-dynamic imagery.
     * @type {Boolean}
     */
    supportsIntervals : {
        get : function() {
            return false;
        }
    },

    /**
     * Gets the Cesium or Leaflet imagery layer object associated with this data source.
     * This property is undefined if the data source is not enabled.
     * @memberOf ImageryLayerCatalogItem.prototype
     * @type {Object}
     */
    imageryLayer : {
        get : function() {
            return this._imageryLayer;
        }
    },

    /**
     * Gets a value indicating whether this data source, when enabled, can be reordered with respect to other data sources.
     * Data sources that cannot be reordered are typically displayed above reorderable data sources.
     * @memberOf ImageryLayerCatalogItem.prototype
     * @type {Boolean}
     */
    supportsReordering : {
        get : function() {
            return !this.keepOnTop;
        }
    },

    /**
     * Gets a value indicating whether the opacity of this data source can be changed.
     * @memberOf ImageryLayerCatalogItem.prototype
     * @type {Boolean}
     */
    supportsOpacity : {
        get : function() {
            return true;
        }
    },

    /**
     * Gets the set of functions used to update individual properties in {@link CatalogMember#updateFromJson}.
     * When a property name in the returned object literal matches the name of a property on this instance, the value
     * will be called as a function and passed a reference to this instance, a reference to the source JSON object
     * literal, and the name of the property.
     * @memberOf ImageryLayerCatalogItem.prototype
     * @type {Object}
     */
    updaters : {
        get : function() {
            return ImageryLayerCatalogItem.defaultUpdaters;
        }
    },

    /**
     * Gets the set of functions used to serialize individual properties in {@link CatalogMember#serializeToJson}.
     * When a property name on the model matches the name of a property in the serializers object lieral,
     * the value will be called as a function and passed a reference to the model, a reference to the destination
     * JSON object literal, and the name of the property.
     * @memberOf ImageryLayerCatalogItem.prototype
     * @type {Object}
     */
    serializers : {
        get : function() {
            return ImageryLayerCatalogItem.defaultSerializers;
        }
    },

    /**
     * Gets the set of names of the properties to be serialized for this object when {@link CatalogMember#serializeToJson} is called
     * for a share link.
     * @memberOf ImageryLayerCatalogItem.prototype
     * @type {String[]}
     */
    propertiesForSharing : {
        get : function() {
            return ImageryLayerCatalogItem.defaultPropertiesForSharing;
        }
    }
});

ImageryLayerCatalogItem.defaultUpdaters = clone(CatalogItem.defaultUpdaters);

ImageryLayerCatalogItem.defaultUpdaters.intervals = function(catalogItem, json, propertyName) {
    if (!defined(json.intervals)) {
        return;
    }

    if (!catalogItem.supportsIntervals) {
        throw new TerriaError({
            sender: catalogItem,
            title: 'Intervals not supported',
            message: 'Sorry, ' + catalogItem.typeName + ' (' + catalogItem.type + ') catalog items cannot currently be made time-varying by specifying the "intervals" property.'
        });
    }

    var result = new TimeIntervalCollection();

    for (var i = 0; i < json.intervals.length; ++i) {
        var interval = json.intervals[i];
        result.addInterval(TimeInterval.fromIso8601({
            iso8601: interval.interval,
            data: interval.data
        }));
    }

    catalogItem.intervals = result;
};

freezeObject(ImageryLayerCatalogItem.defaultUpdaters);

ImageryLayerCatalogItem.defaultSerializers = clone(CatalogItem.defaultSerializers);

ImageryLayerCatalogItem.defaultSerializers.intervals = function(catalogItem, json, propertyName) {
    if (defined(catalogItem.intervals)) {
        var result = [];
        for (var i = 0; i < catalogItem.intervals.length; ++i) {
            var interval = catalogItem.intervals[i];
            result.push({
                interval: TimeInterval.toIso8601(interval),
                data: interval.data
            });
        }
    }
};

freezeObject(ImageryLayerCatalogItem.defaultSerializers);

/**
 * Gets or sets the default set of properties that are serialized when serializing a {@link CatalogItem}-derived object
 * for a share link.
 * @type {String[]}
 */
ImageryLayerCatalogItem.defaultPropertiesForSharing = clone(CatalogItem.defaultPropertiesForSharing);
ImageryLayerCatalogItem.defaultPropertiesForSharing.push('opacity');
ImageryLayerCatalogItem.defaultPropertiesForSharing.push('keepOnTop');

freezeObject(ImageryLayerCatalogItem.defaultPropertiesForSharing);

/**
 * Creates the {@link ImageryProvider} for this catalog item.
 * @param {ImageryLayerTime} [time] The time for which to create an imagery provider.  In layers that are not time-dynamic,
 *                                  this parameter is ignored.
 * @return {ImageryProvider} The created imagery provider.
 */
ImageryLayerCatalogItem.prototype.createImageryProvider = function(time) {
    var result = this._createImageryProvider(time);
    return result;
};

/**
 * When implemented in a derived class, creates the {@link ImageryProvider} for this catalog item.
 * @abstract
 * @protected
 * @param {ImageryLayerTime} [time] The time for which to create an imagery provider.  In layers that are not time-dynamic,
 *                                  this parameter is ignored.
 * @return {ImageryProvider} The created imagery provider.
 */
ImageryLayerCatalogItem.prototype._createImageryProvider = function(time) {
    throw new DeveloperError('_createImageryProvider must be implemented in the derived class.');
};

ImageryLayerCatalogItem.prototype._enable = function() {
    if (defined(this._imageryLayer)) {
        return;
    }

    var isTimeDynamic = false;
    var currentTimeIdentifier;
    var nextTimeIdentifier;

    if (defined(this.intervals) && this.intervals.length > 0) {
        isTimeDynamic = true;

        var clock =  this.terria.clock;
        var index = this.intervals.indexOf(clock.currentTime);

        var nextIndex;
        if (index < 0) {
            this._currentIntervalIndex = -1;
            currentTimeIdentifier = undefined;

            nextIndex = ~index;
            if (clock.multiplier < 0.0) {
                --nextIndex;
            }
        } else {
            this._currentIntervalIndex = index;
            currentTimeIdentifier = this.intervals.get(index).data;

            if (clock.multiplier < 0.0) {
                nextIndex = index - 1;
            } else {
                nextIndex = index + 1;
            }
        }

        if (nextIndex >= 0 && nextIndex < this.intervals.length) {
            this._nextIntervalIndex = nextIndex;
            nextTimeIdentifier = this.intervals.get(nextIndex).data;
        } else {
            this._nextIntervalIndex = -1;
        }
    }

    if (!isTimeDynamic || defined(currentTimeIdentifier)) {
        var currentImageryProvider = this.createImageryProvider(currentTimeIdentifier);
        this._imageryLayer = ImageryLayerCatalogItem.enableLayer(this, currentImageryProvider, this.opacity);
    }

    if (defined(nextTimeIdentifier)) {
        var nextImageryProvider = this.createImageryProvider(nextTimeIdentifier);

        // Do not allow picking from the preloading layer.
        nextImageryProvider.enablePickFeatures = false;

        this._nextLayer = ImageryLayerCatalogItem.enableLayer(this, nextImageryProvider, 0.0);
    }
};

ImageryLayerCatalogItem.prototype._disable = function() {
    ImageryLayerCatalogItem.disableLayer(this, this._imageryLayer);
    this._imageryLayer = undefined;

    ImageryLayerCatalogItem.disableLayer(this, this._nextLayer);
    this._nextLayer = undefined;
};

ImageryLayerCatalogItem.prototype._show = function() {
    ImageryLayerCatalogItem.showLayer(this, this._imageryLayer);
    ImageryLayerCatalogItem.showLayer(this, this._nextLayer);
};

ImageryLayerCatalogItem.prototype._hide = function() {
    ImageryLayerCatalogItem.hideLayer(this, this._imageryLayer);
    ImageryLayerCatalogItem.hideLayer(this, this._nextLayer);
};

ImageryLayerCatalogItem.prototype.showOnSeparateMap = function(globeOrMap) {
    var imageryProvider = this._createImageryProvider();
    var layer = ImageryLayerCatalogItem.enableLayer(this, imageryProvider, this.opacity, undefined, globeOrMap);
    ImageryLayerCatalogItem.showLayer(this, layer, globeOrMap);

    var that = this;
    return function() {
        ImageryLayerCatalogItem.hideLayer(that, layer, globeOrMap);
        ImageryLayerCatalogItem.disableLayer(that, layer, globeOrMap);
    };
};

function updateOpacity(imageryLayerItem) {
    if (defined(imageryLayerItem._imageryLayer) && imageryLayerItem.isEnabled && imageryLayerItem.isShown) {
        if (defined(imageryLayerItem._imageryLayer.alpha)) {
            imageryLayerItem._imageryLayer.alpha = imageryLayerItem.opacity;
        }

        if (defined(imageryLayerItem._imageryLayer.setOpacity)) {
            imageryLayerItem._imageryLayer.setOpacity(imageryLayerItem.opacity);
        }

        imageryLayerItem.terria.currentViewer.notifyRepaintRequired();
    }
}

ImageryLayerCatalogItem.enableLayer = function(catalogItem, imageryProvider, opacity, layerIndex, globeOrMap) {
    globeOrMap = defaultValue(globeOrMap, catalogItem.terria.currentViewer);

    const layer = globeOrMap.addImageryProvider({
        imageryProvider: imageryProvider,
        rectangle: catalogItem.rectangle,
        clipToRectangle: catalogItem.clipToRectangle,
        opacity: opacity,
        layerIndex: layerIndex,
        treat403AsError: catalogItem.treat403AsError,
        treat404AsError: catalogItem.treat404AsError,
        ignoreUnknownTileErrors: catalogItem.ignoreUnknownTileErrors,
        isRequiredForRendering: catalogItem.isRequiredForRendering,
        onLoadError: function() {
            if (defined(layer) && layer.show) {
                catalogItem.terria.error.raiseEvent(new TerriaError({
                    sender: catalogItem,
                    title: 'Error accessing catalogue item',
                    message: '\
An error occurred while attempting to download tiles for catalogue item ' + catalogItem.name + '.  This may indicate that there is a \
problem with your internet connection, that the catalogue item is temporarily unavailable, or that the catalogue item \
is invalid.  The catalogue item has been hidden from the map.  You may re-show it in the Now Viewing panel to try again.'
                }));

                globeOrMap.hideImageryProvider(layer);
            }
        },
        onProjectionError: function() {
            // If the TileLayer experiences an error, hide the catalog item and inform the user.
            catalogItem.terria.error.raiseEvent({
                sender: catalogItem,
                title: 'Unable to display dataset',
                message: '\
    "' + catalogItem.name + '" cannot be shown in 2D because it does not support the standard Web Mercator (EPSG:3857) projection.  \
    Please switch to 3D if it is supported on your system, update the dataset to support the projection, or use a different dataset.'
            });

            globeOrMap.hideImageryProvider(layer);
        }
    });

    return layer;
};

ImageryLayerCatalogItem.disableLayer = function(catalogItem, layer, globeOrMap) {
    if (!defined(layer)) {
        return;
    }

    globeOrMap = defaultValue(globeOrMap, catalogItem.terria.currentViewer);
    globeOrMap.removeImageryLayer({
        layer: layer
    });
};

function updateClockSubscription(catalogItem) {
    if (catalogItem.isShown && defined(catalogItem.clock)) {
        // Subscribe
        if (!defined(catalogItem._clockTickSubscription)) {
            catalogItem._clockTickSubscription = catalogItem.terria.clock.onTick.addEventListener(onClockTick.bind(undefined, catalogItem));
        }
    } else {
        // Unsubscribe
        if (defined(catalogItem._clockTickSubscription)) {
            catalogItem._clockTickSubscription();
            catalogItem._clockTickSubscription = undefined;
        }
    }
}

function onClockTick(catalogItem, clock) {
    var intervals = catalogItem.intervals;
    if (!defined(intervals) || !catalogItem.isEnabled || !catalogItem.isShown) {
        return;
    }

    var index = catalogItem._currentIntervalIndex;

    if (index < 0 || index >= intervals.length || !TimeInterval.contains(intervals.get(index), clock.currentTime)) {
        // Find the interval containing the current time.
        index = intervals.indexOf(clock.currentTime);
        if (index < 0) {
            // No interval contains this time, so do not show imagery at this time.
            ImageryLayerCatalogItem.disableLayer(catalogItem, catalogItem._imageryLayer);
            catalogItem._imageryLayer = undefined;
            catalogItem._currentIntervalIndex = -1;
            return;
        }

        // If the "next" layer is not applicable to this time, throw it away and create a new one.
        if (index !== catalogItem._nextIntervalIndex) {
            // Throw away the "next" layer, since it's not applicable.
            ImageryLayerCatalogItem.disableLayer(catalogItem, catalogItem._nextLayer);
            catalogItem._nextLayer = undefined;
            catalogItem._nextIntervalIndex = -1;

            // Create the new "next" layer
            var imageryProvider = catalogItem.createImageryProvider(catalogItem.intervals.get(index).data);
            imageryProvider.enablePickFeatures = false;
            catalogItem._nextLayer = ImageryLayerCatalogItem.enableLayer(catalogItem, imageryProvider, 0.0);
            ImageryLayerCatalogItem.showLayer(catalogItem, catalogItem._nextLayer);
        }

        // At this point we can assume that _nextLayer is applicable to this time.
        // Make it visible
        setOpacity(catalogItem, catalogItem._nextLayer, catalogItem.opacity);
        fixNextLayerOrder(catalogItem);
        ImageryLayerCatalogItem.disableLayer(catalogItem, catalogItem._imageryLayer);

        catalogItem._imageryLayer = catalogItem._nextLayer;
        catalogItem._imageryLayer.imageryProvider.enablePickFeatures = true;
        catalogItem._nextLayer = undefined;
        catalogItem._nextIntervalIndex = -1;
        catalogItem._currentIntervalIndex = index;
    }

    // Prefetch the (predicted) next layer.
    var nextIndex = clock.multiplier >= 0.0 ? index + 1 : index - 1;
    if (nextIndex < 0 || nextIndex >= intervals.length || nextIndex === catalogItem._nextIntervalIndex) {
        return;
    }

    var nextImageryProvider = catalogItem.createImageryProvider(catalogItem.intervals.get(nextIndex).data);
    nextImageryProvider.enablePickFeatures = false;
    catalogItem._nextLayer = ImageryLayerCatalogItem.enableLayer(catalogItem, nextImageryProvider, 0.0);
    ImageryLayerCatalogItem.showLayer(catalogItem, catalogItem._nextLayer);
    catalogItem._nextIntervalIndex = nextIndex;
}

function setOpacity(catalogItem, layer, opacity) {
    if (!defined(layer)) {
        return;
    }

    if (defined(catalogItem.terria.cesium)) {
        layer.alpha = opacity;
    }

    if (defined(catalogItem.terria.leaflet)) {
        layer.setOpacity(opacity);
    }
}

ImageryLayerCatalogItem.showLayer = function(catalogItem, layer, globeOrMap) {
    if (!defined(layer)) {
        return;
    }

    globeOrMap = defaultValue(globeOrMap, catalogItem.terria.currentViewer);
    globeOrMap.showImageryLayer({
        layer: layer
    });
};

ImageryLayerCatalogItem.hideLayer = function(catalogItem, layer, globeOrMap) {
    if (!defined(layer)) {
        return;
    }

    globeOrMap = defaultValue(globeOrMap, catalogItem.terria.currentViewer);
    globeOrMap.hideImageryLayer({
        layer: layer
    });
};

function fixNextLayerOrder(catalogItem) {
    if (!defined(catalogItem._imageryLayer) || !defined(catalogItem._nextLayer)) {
        return;
    }

    if (defined(catalogItem.terria.cesium)) {
        var imageryLayers = catalogItem.terria.cesium.scene.imageryLayers;

        var currentIndex = imageryLayers.indexOf(catalogItem._imageryLayer);
        var nextIndex = imageryLayers.indexOf(catalogItem._nextLayer);
        if (currentIndex < 0 || nextIndex < 0) {
            return;
        }

        while (nextIndex < currentIndex - 1) {
            imageryLayers.raise(catalogItem._nextLayer);
            ++nextIndex;
        }

        while (nextIndex > currentIndex + 1) {
            imageryLayers.lower(catalogItem._nextLayer);
            --nextIndex;
        }
    }
}

/**
 * Set time to nearest time to specified (may be start or end of time range if time is not in range).
 * @param {ImageryLayerCatalogItem} catalogItem catalog item to set timeslider current time on
 * @param {JulianDate} date to set
 * @private
 */
function _setTimeIfInRange(catalogItem, timeToSet)
{
    if (JulianDate.lessThan(timeToSet, catalogItem._clock.startTime)) {
        catalogItem._clock.currentTime = catalogItem._clock.startTime;
    }
    else if (JulianDate.greaterThan(timeToSet, catalogItem._clock.stopTime)) {
        catalogItem._clock.currentTime = catalogItem._clock.stopTime;

    } else {
        catalogItem._clock.currentTime = timeToSet;
    }
}

/**
 * Sets the current time of the clock, so the animation starts at a point which can be user defined.
 * Valid options in config file are:
 *     initialTimeSource: "present"                            // closest to today's date
 *     initialTimeSource: "start"                              // start of time range of animation
 *     initialTimeSource: "end"                                // end of time range of animation
 *     initialTimeSource: An ISO8601 date e.g. "2015-08-08"    // specified date or nearest if date is outside range
 * @param {ImageryLayerCatalogItem} catalogItem catalog item to set timeslider current time on
 * @private
 */
function _setClockCurrentTime(catalogItem)
{
    // This is our default. Start at the nearest instant in time.
    var now = JulianDate.now();
    _setTimeIfInRange(catalogItem, now);

    var initialTimeSource = catalogItem.initialTimeSource;
    if (!defined(initialTimeSource)) {
        initialTimeSource = "present";
    }
    switch(initialTimeSource)
    {
        case "start":
            catalogItem._clock.currentTime = catalogItem._clock.startTime;
            break;
        case "end":
            catalogItem._clock.currentTime = catalogItem._clock.stopTime;
            break;
        case "present":
            // Set to present by default.
            break;
        default:
            // Note that if it's not an ISO8601 timestamp, it ends up being set to present.
            // Find out whether it's an ISO8601 timestamp.
            var timestamp;
            try {
                timestamp = JulianDate.fromIso8601(initialTimeSource);
            }
            catch (e) {
                throw new TerriaError('No good initialTimeSource specified in config file: ' + initialTimeSource);
            }
            if (defined(timestamp))
            {
                _setTimeIfInRange(catalogItem, timestamp);
            }
    }
}


module.exports = ImageryLayerCatalogItem;

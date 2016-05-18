'use strict';

import defined from 'terriajs-cesium/Source/Core/defined';
import FeatureInfoCatalogItem from './FeatureInfoCatalogItem.jsx';
import Loader from '../Loader.jsx';
import ObserveModelMixin from '../ObserveModelMixin';
import React from 'react';
import knockout from 'terriajs-cesium/Source/ThirdParty/knockout';
import Entity from 'terriajs-cesium/Source/DataSources/Entity';

const FeatureInfoPanel = React.createClass({
    mixins: [ObserveModelMixin],
    propTypes: {
        terria: React.PropTypes.object.isRequired,
        viewState: React.PropTypes.object.isRequired
    },

    componentDidMount() {
        const createFakeSelectedFeatureDuringPicking = true;
        const terria = this.props.terria;
        this._pickedFeaturesSubscription = knockout.getObservable(terria, 'pickedFeatures').subscribe(() => {
            const pickedFeatures = terria.pickedFeatures;
            if (!defined(pickedFeatures)) {
                terria.selectedFeature = undefined;
            } else {
                if (createFakeSelectedFeatureDuringPicking) {
                    const fakeFeature = new Entity({
                        id: 'Pick Location'
                    });
                    fakeFeature.position = pickedFeatures.pickPosition;
                    terria.selectedFeature = fakeFeature;
                } else {
                    terria.selectedFeature = undefined;
                }
                if (defined(pickedFeatures.allFeaturesAvailablePromise)) {
                    pickedFeatures.allFeaturesAvailablePromise.then(() => {
                        terria.selectedFeature = pickedFeatures.features.filter(featureHasInfo)[0];
                    });
                }
            }
        });
    },

    componentWillUnmount() {
        if (defined(this._pickedFeaturesSubscription)) {
            this._pickedFeaturesSubscription.dispose();
            this._pickedFeaturesSubscription = undefined;
        }
    },

    bringToFront() {
        // Bring feature info panel to front.
        this.props.viewState.switchComponentOrder(this.props.viewState.componentOrderOptions.featureInfoPanel);
    },

    getFeatureInfoCatalogItems() {
        const {catalogItems, featureCatalogItemPairs} = getFeaturesGroupedByCatalogItems(this.props.terria);

        return catalogItems.map((catalogItem, i) => {
            // From the pairs, select only those with this catalog item, and pull the features out of the pair objects.
            const features = featureCatalogItemPairs.filter(pair => pair.catalogItem === catalogItem).map(pair => pair.feature);
            return (
                <FeatureInfoCatalogItem
                    key={i}
                    viewState={this.props.viewState}
                    catalogItem={catalogItem}
                    features={features}
                    terria={this.props.terria}
                />
            );
        });
    },

    close() {
        this.props.viewState.featureInfoPanelIsVisible = false;
    },

    toggleCollapsed() {
        this.props.viewState.featureInfoPanelIsCollapsed = !this.props.viewState.featureInfoPanelIsCollapsed;
    },

    render() {
        const terria = this.props.terria;
        const viewState = this.props.viewState;
        const componentOnTop = (viewState.componentOnTop === viewState.componentOrderOptions.featureInfoPanel);
        const featureInfoCatalogItems = this.getFeatureInfoCatalogItems();
        return (
            <div
                className={`feature-info-panel ${componentOnTop ? 'is-top' : ''} ${viewState.featureInfoPanelIsCollapsed ? 'is-collapsed' : ''} ${viewState.featureInfoPanelIsVisible ? 'is-visible' : ''}`}
                aria-hidden={!viewState.featureInfoPanelIsVisible}
                onClick={this.bringToFront}>
                <div className='feature-info-panel__header'>
                    <button type='button' onClick={ this.toggleCollapsed } className='btn'>
                        Feature Information
                    </button>
                    <button type='button' onClick={ this.close } className="btn btn--close-feature"
                            title="Close data panel"/>
                </div>
                <ul className="feature-info-panel__body">
                    <Choose>
                        <When condition={viewState.featureInfoPanelIsCollapsed || !viewState.featureInfoPanelIsVisible}>
                        </When>
                        <When condition={defined(terria.pickedFeatures) && terria.pickedFeatures.isLoading}>
                            <li><Loader/></li>
                        </When>
                        <When condition={!featureInfoCatalogItems || featureInfoCatalogItems.length === 0}>
                            <li className='no-results'>No results</li>
                        </When>
                        <Otherwise>
                            {featureInfoCatalogItems}
                        </Otherwise>
                    </Choose>
                </ul>
            </div>
        );
    }
});

/**
 * Returns an object of {catalogItems, featureCatalogItemPairs}.
 */
function getFeaturesGroupedByCatalogItems(terria) {
    if (!defined(terria.pickedFeatures)) {
        return {catalogItems: [], featureCatalogItemPairs: []};
    }
    const features = terria.pickedFeatures.features;
    const featureCatalogItemPairs = [];  // Will contain objects of {feature, catalogItem}.
    const catalogItems = []; // Will contain a list of all unique catalog items.

    features.forEach(feature => {
        // Why was this here? Surely changing the feature objects is not a good side-effect?
        // if (!defined(feature.position)) {
        //     feature.position = terria.pickedFeatures.pickPosition;
        // }
        const catalogItem = determineCatalogItem(terria.nowViewing, feature);
        featureCatalogItemPairs.push({
            catalogItem: catalogItem,
            feature: feature
        });
        if (catalogItems.indexOf(catalogItem) === -1) {  // Note this works for undefined too.
            catalogItems.push(catalogItem);
        }
    });

    return {catalogItems, featureCatalogItemPairs};
}

/**
 * Figures out what the catalog item for a feature is.
 *
 * @param nowViewing {@link SidePanelHeader} to look in the items for.
 * @param feature Feature to match
 * @returns {CatalogItem}
 */
function determineCatalogItem(nowViewing, feature) {
    if (!defined(nowViewing)) {
        // So that specs do not need to define a nowViewing.
        return undefined;
    }

    // "Data sources" (eg. czml, geojson, kml, csv) have an entity collection defined on the entity
    // (and therefore the feature).
    // Then match up the data source on the feature with a now-viewing item's data source.
    let result;
    let i;
    if (defined(feature.entityCollection) && defined(feature.entityCollection.owner)) {
        const dataSource = feature.entityCollection.owner;
        for (i = nowViewing.items.length - 1; i >= 0; i--) {
            if (nowViewing.items[i].dataSource === dataSource) {
                result = nowViewing.items[i];
                break;
            }
        }
        return result;
    }

    // If there is no data source, but there is an imagery layer (eg. ArcGIS),
    // we can match up the imagery layer on the feature with a now-viewing item.
    if (defined(feature.imageryLayer)) {
        const imageryLayer = feature.imageryLayer;
        for (i = nowViewing.items.length - 1; i >= 0; i--) {
            if (nowViewing.items[i].imageryLayer === imageryLayer) {
                result = nowViewing.items[i];
                break;
            }
        }
        return result;
    }

    // Otherwise, no luck.
    return undefined;
}

/**
 * Determines whether the passed feature has properties or a description.
 */
function featureHasInfo(feature) {
    return (defined(feature.properties) || defined(feature.description));
}

module.exports = FeatureInfoPanel;

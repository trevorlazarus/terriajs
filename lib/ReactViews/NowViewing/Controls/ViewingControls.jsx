'use strict';

import Cartographic from 'terriajs-cesium/Source/Core/Cartographic';
import defined from 'terriajs-cesium/Source/Core/defined';
import Ellipsoid from 'terriajs-cesium/Source/Core/Ellipsoid';
import when from 'terriajs-cesium/Source/ThirdParty/when';
import Rectangle from 'terriajs-cesium/Source/Core/Rectangle';

import ObserveModelMixin from '../../ObserveModelMixin';
import PickedFeatures from '../../../Map/PickedFeatures';

import React from 'react';

import Styles from './viewing-controls.scss';

const ViewingControls = React.createClass({
    mixins: [ObserveModelMixin],

    propTypes: {
        nowViewingItem: React.PropTypes.object.isRequired,
        viewState: React.PropTypes.object.isRequired
    },

    removeFromMap() {
        this.props.nowViewingItem.isEnabled = false;
    },
    zoomTo() {
        this.props.nowViewingItem.zoomToAndUseClock();
    },

    openFeature() {
        const nowViewingItem = this.props.nowViewingItem;
        const pickedFeatures = new PickedFeatures();
        pickedFeatures.features.push(nowViewingItem.tableStructure.sourceFeature);
        pickedFeatures.allFeaturesAvailablePromise = when();
        pickedFeatures.isLoading = false;
        const xyzPosition = nowViewingItem.tableStructure.sourceFeature.position.getValue(nowViewingItem.terria.clock.currentTime);
        const ellipsoid = Ellipsoid.WGS84;
        // Code replicated from GazetteerSearchProviderViewModel.
        const bboxRadians = 0.1;  // GazetterSearchProviderViewModel uses 0.2 degrees ~ 0.0035 radians. 1 degree ~ 110km. 0.1 radian ~ 700km.

        const latLonPosition = Cartographic.fromCartesian(xyzPosition, ellipsoid);
        const south = latLonPosition.latitude + bboxRadians / 2;
        const west = latLonPosition.longitude - bboxRadians / 2;
        const north = latLonPosition.latitude - bboxRadians / 2;
        const east = latLonPosition.longitude + bboxRadians / 2;
        const rectangle = new Rectangle(west, south, east, north);
        const flightDurationSeconds = 1;
        // TODO: This is bad. How can we do it better?
        setTimeout(function() {
            nowViewingItem.terria.pickedFeatures = pickedFeatures;
            nowViewingItem.terria.currentViewer.zoomTo(rectangle, flightDurationSeconds);
        }, 50);
    },

    previewItem() {
        let item = this.props.nowViewingItem;
        // If this is a chartable item opened from another catalog item, get the info of the original item.
        if (defined(item.sourceCatalogItem)) {
            item = item.sourceCatalogItem;
        }
        // Open up all the parents (doesn't matter that this sets it to enabled as well because it already is).
        item.enableWithParents();
        this.props.viewState.viewCatalogItem(item);
        this.props.viewState.switchMobileView(this.props.viewState.mobileViewOptions.preview);
    },

    render() {
        const nowViewingItem = this.props.nowViewingItem;

        return (
            <ul className={Styles.control}>
                <If condition={nowViewingItem.isMappable}>
                    <li className={Styles.zoom}><button type='button' onClick={this.zoomTo} title="Zoom to data" className={Styles.btn}>Zoom To Extent</button></li>
                </If>
                <If condition={nowViewingItem.tableStructure && nowViewingItem.tableStructure.sourceFeature}>
                    <li className={Styles.openFeature}><button type='button' onClick={this.openFeature} title="Open source feature" className={Styles.btn}>Zoom To</button></li>
                </If>
                <If condition={nowViewingItem.showsInfo}>
                    <li className={Styles.info}><button type='button' onClick={this.previewItem} className={Styles.btn} title='info'>About This Data Set</button></li>
                </If>
                <li className={Styles.remove}>
                    <button type='button' onClick={this.removeFromMap} title="Remove this data" className={Styles.btn}>Remove</button>
                    <i className={Styles.iconRemove} />
                </li>
            </ul>
        );
    }
});
module.exports = ViewingControls;

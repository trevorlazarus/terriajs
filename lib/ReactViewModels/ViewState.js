'use strict';

/*global require*/
var knockout = require('terriajs-cesium/Source/ThirdParty/knockout');
import addedByUser from '../Core/addedByUser';
import MouseCoords from './MouseCoords';
import SearchState from './SearchState';

/**
 * Root of a global view model. Presumably this should get nested as more stuff goes into it. Basically this belongs to
 * the root of the UI and then it can choose to pass either the whole thing or parts down as props to its children.
 */

export default class ViewState {
    constructor(options) {
        const terria = options.terria;

        this.mobileViewOptions = Object.freeze({
            data: 'data',
            preview: 'preview',
            nowViewing: 'nowViewing',
            search: 'search'
        });

        this.componentOrderOptions = Object.freeze({
            chart: 0,
            featureInfoPanel: 1,
            modelWindow: 2
        });

        this.searchState = new SearchState({
            terria: terria,
            catalogSearchProvider: options.catalogSearchProvider,
            locationSearchProviders: options.locationSearchProviders
        });

        this.terria = terria;
        this.previewedItem = undefined;
        this.userDataPreviewedItem = undefined;
        this.modalVisible = false;
        this.modalTabIndex = 0;
        this.isDraggingDroppingFile = false;
        this.mobileView = null;
        this.componentOnTop = this.componentOrderOptions.chart;
        this.isMapFullScreen = false;

        // TODO: Super temporary advanced data science A/B testing flag!! Remove soon!!
        this.closeModalAfterAdd = false;

        /**
         * Gets or sets a value indicating whether the small screen (mobile) user interface should be used.
         * @type {Boolean}
         */
        this.useSmallScreenInterface = false;

        /**
         * Gets or sets a value indicating whether the feature info panel is visible.
         * @type {Boolean}
         */
        this.featureInfoPanelIsVisible = false;

        /**
         * Gets or sets a value indicating whether the feature info panel is collapsed.
         * When it's collapsed, only the title bar is visible.
         * @type {Boolean}
         */
        this.featureInfoPanelIsCollapsed = false;

        this.notifications = [];

        /**
         * Gets or sets a value indicating whether the feedback form is visible.
         * @type {Boolean}
         */
        this.feedbackFormIsVisible = false;


        this.mouseCoords = new MouseCoords();
        knockout.track(this, [
            'previewedItem',
            'catalogSearch',
            'modalVisible',
            'modalTabIndex',
            'userDataPreviewedItem',
            'isDraggingDroppingFile',
            'mobileView',
            'componentOnTop',
            'useSmallScreenInterface',
            'featureInfoPanelIsVisible',
            'featureInfoPanelIsCollapsed',
            'notifications',
            'isMapFullScreen',
            'feedbackFormIsVisible'
        ]);

        // Show errors to the user as notifications.
        terria.error.addEventListener(e => {
            // Only add this error if an identical one doesn't already exist.
            if (this.notifications.filter(item => item.title === e.title && item.message === e.message).length === 0) {
                this.notifications.push({
                    title: e.title,
                    message: e.message
                });
            }
        });

        // When features are picked, show the feature info panel.
        this._pickedFeaturesSubscription = knockout.getObservable(terria, 'pickedFeatures').subscribe(() => {
            this.featureInfoPanelIsVisible = true;
            this.featureInfoPanelIsCollapsed = false;
        }, this);
    }

    dispose() {
        this._pickedFeaturesSubscription.dispose();
    }

    openAddData() {
        this.modalVisible = true;
        this.modalTabIndex = 0;
    }

    openUserData() {
        this.modalVisible = true;
        this.modalTabIndex = 1;
    }

    searchInCatalog(query) {
        this.openAddData();
        this.searchState.catalogSearchText = query;
        this.searchState.searchCatalog();
    }

    viewCatalogItem(item) {
        if (addedByUser(item)) {
            this.userDataPreviewedItem = item;
            this.openUserData();
        } else {
            this.previewedItem = item;
            this.openAddData();
        }
    }

    toggleModal(bool) {
        this.modalVisible = bool;
    }

    switchMobileView(viewName){
        this.mobileView = viewName;
    }

    switchComponentOrder(component){
        this.componentOnTop = component;
    }

    getNextNotification() {
        return this.notifications[0];
    }

    hideMapUi() {
        return this.getNextNotification() && this.getNextNotification().hideUi;
    }
}

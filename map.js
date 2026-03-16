import { transformStreets, transformStreetsProtocol } from './transformtiles.js';

document.addEventListener('DOMContentLoaded', () => {

    const srcBoundOptions = {
        bounds: [-122.8553775, 45.4314992, -122.4235556, 45.6505841],
    };

    const map = new maplibregl.Map({
        container: 'map',
        // style: 'https://tiles.openfreemap.org/styles/positron',
        // style: 'https://tiles.openfreemap.org/styles/liberty',
        style: 'data/blmapstyle.json',
        // center: [-122.5927, 45.4885],
        // zoom: 11,
        bounds: srcBoundOptions.bounds,
        hash: true,
    });

    // to facilitate testing/development
    window.map = map;

    maplibregl.addProtocol(transformStreetsProtocol, transformStreets);

    // set up transform
    map.setTransformRequest((url, resourceType) => {
        if (url.startsWith('https://tiles.openfreemap.org/') && resourceType === 'Tile') {
            return { url: transformStreetsProtocol + '://' + url };
        }
        return undefined;
    });

    // Add zoom and rotation controls to the map.
    map.addControl(new maplibregl.NavigationControl({
        visualizePitch: true,
        visualizeRoll: true,
        showZoom: true,
        showCompass: true
    }));

    map.addControl(new maplibregl.FullscreenControl(), 'top-right');

    map.addControl(new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        fitBoundsOptions: { maxZoom: 15 },
    }));
    
    map.addControl(new maplibreGLMeasures.default({
        units: 'imperial',
        fixedAreaUnit: 'ft2',
        fixedLengthUnit: 'ft',
        showOnlyTotalLineLength: true,
        style: {text: {font: 'Noto Sans Bold'}},
    }), 'top-left');

    // Close sidebar on mobile when clicking the map
    const closeSidebar = () => {
        document.querySelector('.sidebar').classList.remove('open');
    };
    map.on('touchstart', closeSidebar);
    map.on('click', closeSidebar);

    // Update vanishing point of map to match sidebar size
    function updatePadding() {
        let mapPadding = 0;
        if (window.innerWidth > 700) {
            mapPadding = document.querySelector('.sidebar').clientWidth;
        }
        map.easeTo({padding: {right: mapPadding}});
    }
    window.addEventListener('resize', updatePadding);
    updatePadding();

    map.on('load', async () => {
        // Find the index of the first symbol layer and road layer in the map style
        const layers = map.getStyle().layers;
        let firstSymbolId;
        let firstRoadId;

        for (const l of map.getStyle().layers)
        {  
            if (!firstSymbolId && l.type === 'symbol') firstSymbolId = l.id;
            if (!firstRoadId && l.type === 'line' && l.id.startsWith('highway_')) firstRoadId = l.id;
            if (firstRoadId && firstSymbolId) break;
        }

        // console.log('firstSymbolId', firstSymbolId);
        // console.log('firstRoadId', firstRoadId);

        ////////////////////////////////////////////
        //////////// Sources ///////////////////////
        ////////////////////////////////////////////

        // Add image sources for custom map icons

        // Traffic signal icon
        const signalImg = 'icons/traffic-signal.png';
        await map.loadImage(signalImg).then(img => {
            const scale = Math.max(img.data.width, img.data.height) / 24;
            map.addImage('traffic-signal-img', img.data, {pixelRatio: scale});
        }, err => {
            throw err;
        });

        // Stop sign icon
        const stopSignImg = 'icons/stop-sign.png';
        await map.loadImage(stopSignImg).then(img => {
            const scale = Math.max(img.data.width, img.data.height) / 16;
            map.addImage('stop-sign-img', img.data, {pixelRatio: scale});
        }, err => {
            throw err;
        });

        // Bike route sign icon
        const bikeSignImg = 'icons/bike-route-sign.png';
        await map.loadImage(bikeSignImg).then(img => {
            const scale = Math.max(img.data.width, img.data.height) / 16;
            map.addImage('bike-route-img', img.data, {pixelRatio: scale});
        }, err => {
            throw err;
        });

        // RRFB icon
        const rrfbImg = 'icons/rrfb-icon.png';
        await map.loadImage(rrfbImg).then(img => {
            const scale = Math.max(img.data.width, img.data.height) / 16;
            map.addImage('rrfb-img', img.data, {pixelRatio: scale});
        }, err => {
            throw err;
        });



        // 3D terrain data. Currently disabled as it's not very good resolution, especially in downtown Portland. 

        // map.addSource('terrainSource', {type: 'raster-dem', url: 'https://tiles.mapterhorn.com/tilejson.json', maxzoom: 12});
        // map.setTerrain({source: 'terrainSource', exaggeration: 1.25});
        // map.addLayer({id: 'hillshadeLayer', type: 'hillshade', source: 'terrainSource'} /*, firstSymbolId */)

        // Alternate DEM source, DOGAMI LIDAR is higher quality but isn't in a format that can be natively 
        // used by MaplibreGL for 3D terrain and hillshade, so it's just a raster overlay
        /*
        new esrigl.ImageService('demSource', map, {
            url: 'https://gis.dogami.oregon.gov/arcgis/rest/services/lidar/DIGITAL_TERRAIN_MODEL_MOSAIC_HS/ImageServer',
        });

        map.addLayer({
            id: 'demLayer',
            type: 'raster',
            source: 'demSource',
            paint: {'raster-opacity': 0.25},
        }, 'building');
        */

        // Attribution string used for all PBOT data sources
        const pbotAttrib = '<a href="https://www.portlandmaps.com/">City of Portland GIS</a>';
        
        // PBOT high crash network
        addSourceFromService(
            map, 
            'pbot-high-crash-network-source',
            'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Transportation/MapServer/209/query?f=geojson',
            {
                attribution: pbotAttrib,
            },
        );
        
        // PBOT recommended bike routes
        const routesService = new esrigl.DynamicMapService(
            'pbot-routes', 
            map, 
            {
                url: 'https://www.portlandmaps.com/arcgis/rest/services/Public/PBOT_RecommendedBicycleRoutes/MapServer',
                layers: [0, 4, 5],
            },
            {
                ...srcBoundOptions,
                attribution: pbotAttrib,
            },
        );

        // Portland Maps ortho imagery
        new esrigl.TiledMapService('pdx-orthos-src', map, 
            {
                url: 'https://www.portlandmaps.com/arcgis/rest/services/Public/Aerial_Photos_Summer_2025/MapServer',
            },
            {
                ...srcBoundOptions,
                maxzoom: 21,
                attribution: pbotAttrib,
            }
        );

        // ESRI World Imagery service
        new esrigl.TiledMapService('esri-imagery-src', map, 
            {
                url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
            },
            {
                maxzoom: 20,
                attribution: '<a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer">ESRI</a>',
            },
        );

        // Ride With GPS public heatmap
        map.addSource('rwgps-heatmap-src', {
            type: 'raster',
            tiles: [
                'https://heatmap.ridewithgps.com/v2/map/default/global-23/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '<a href="https://ridewithgps.com/heatmap">RideWithGPS</a>',
            maxzoom: 18,
        });
        
        // Alternate version of the pavement markings service
        /*
        const markingsService = new esrigl.DynamicMapService('pbot-markings', map, {
            url: 'https://www.portlandmaps.com/arcgis/rest/services/Public/Transportation/MapServer',
            layers: [61,47,48,49,50],
        });
        */
        
        // PBOT pavement markings service (includes curbs, islands, paint, etc.)
        const markingsService = new esrigl.DynamicMapService(
            'pbot-markings', 
            map, 
            {
                url: 'https://www.portlandmaps.com/arcgis/rest/services/Public/PBOT_Assets/MapServer',
                layers: [122,136,135],
            },
            {
                ...srcBoundOptions,
                // maxzoom: 21,
                attribution: pbotAttrib,
            }
        );

        // PBOT speed limits service
        const speedLimitService = new esrigl.DynamicMapService(
            'pbot-speed-limits', 
            map, 
            {
                url: 'https://www.portlandmaps.com/arcgis/rest/services/Public/Transportation/MapServer',
                layers: [55,56],
            },
            {
                ...srcBoundOptions,
                attribution: pbotAttrib,
            }
        );
        
        // PBOT traffic signals
        const signalsMinZoom = 14;
        addSourceFromService(
            map, 
            'pbot-signals-source',
            'https://www.portlandmaps.com/arcgis/rest/services/Public/PBOT_Assets/MapServer/199/query',
            {
                attribution: pbotAttrib,
            },
        );

        // PBOT stop signs
        const signsMinZoom = 16;
        addSourceFromService(
            map, 
            'pbot-stopsigns-source',
            'https://www.portlandmaps.com/arcgis/rest/services/Public/PBOT_Assets/MapServer/100/query',
            {
                attribution: pbotAttrib,
            },
            {
                where: "SIGNCODE IN ('R1010','R1011')",
                outFields: 'rotation',
            },
        );

        // PBOT bike routing signs
        addSourceFromService(
            map, 
            'pbot-bikesigns-source',
            'https://www.portlandmaps.com/arcgis/rest/services/Public/PBOT_Assets/MapServer/102/query',
            {
                attribution: pbotAttrib,
            },
            {
                where: "SIGNCODE LIKE 'S5%'",
                outFields: 'signcode,rotation',
            },
        );

        // PBOT flashing signals
        addSourceFromService(
            map, 
            'pbot-rrfb-src',
            'https://www.portlandmaps.com/arcgis/rest/services/Public/PBOT_Assets/MapServer/206/query?where=ISBType+IN+%282540%2C+2550%29&outSR=4326&f=geojson',
            {
                attribution: pbotAttrib,
            },
        );

        // Biketown service area
        addGeojsonSource(map, 'biketown-border-src', async () => {
            const biketownBorderGeojson = await fetch('https://www.portlandmaps.com/od/rest/services/COP_OpenData_Transportation/MapServer/1301/query?outFields=*&where=1%3D1&f=geojson').then(r => r.json()).catch(console.error);
            return turf.mask(biketownBorderGeojson);
        }, {
            attribution: pbotAttrib,
        });

        // Biketown available bikes
        const getBiketownBikes = async () => {
            const biketownAvailableBikes = await fetch('https://gbfs.lyft.com/gbfs/2.3/pdx/en/free_bike_status.json').then(r => r.json()).catch(console.error);
            let biketownGeoData = {type: 'FeatureCollection', features: []};
            if (biketownAvailableBikes) {
                const maxRange = Math.max(...biketownAvailableBikes.data.bikes.map(b => b.current_range_meters));
                biketownAvailableBikes.data.bikes.forEach(b => {
                    if (b.is_disabled || b.is_reserved) return;
        
                    const {bike_id, lat, lon, ...properties} = b;
                    properties.pct_range = properties.current_range_meters / maxRange;
                    properties.range_miles = properties.current_range_meters / 1609;
        
                    const geometry = {
                        coordinates: [lon, lat],
                        type: 'Point',
                    };
        
                    const bikeFeat = {
                        id: bike_id,
                        type: 'Feature',
                        geometry,
                        properties,
                    };
        
                    biketownGeoData.features.push(bikeFeat);
                });
            }
            return biketownGeoData;
        };

        addGeojsonSource(
            map, 
            'biketown-available-src', 
            getBiketownBikes,
            {
                attribution: '<a href="https://biketownpdx.com/">BikeTown</a>',
                cluster: true,
                clusterRadius: 5,
                clusterMaxZoom: 15,
            },
        );

        map.addSource('trimet-stop-tiles', {
            type: "vector",
            tiles: ["https://ws.trimet.org/geoserver/gwc/service/tms/1.0.0/ott:current_stops@EPSG:900913@pbf/{z}/{x}/{y}.pbf"],
            minzoom: 14,
            maxzoom: 21,
            scheme: "tms",
            attribution: '<a href="https://developer.trimet.org/gis/">TriMet</a>',
        });

        map.addSource('trimet-route-tiles', {
            type: "vector",
            tiles: ['https://ws.trimet.org/geoserver/gwc/service/tms/1.0.0/ott:current_routes@EPSG:900913@pbf/{z}/{x}/{y}.pbf'],
            minzoom: 0,
            maxzoom: 21,
            scheme: 'tms',
            attribution: '<a href="https://developer.trimet.org/gis/">TriMet</a>',
        });

        // PDX Reporter data from webhookdb
        // Raw json format must be reshaped into GeoJSON for proper use as a map source
        const getPdxReporter = async () => {
            const pdxReporterData = await fetch('https://api.webhookdb.com/v1/saved_queries/svq_23en3z2idq56ktlc2ivb4x6ri/run').then(r => r.json()).catch(console.error);
            let pdxReporterGeoData = {"type": "FeatureCollection", "features": []};
            if (pdxReporterData) {
                pdxReporterData.rows.forEach(r => {
                    const {entry_id, geo_lat, geo_lng, ...properties} = pdxReporterData.headers.reduce((acc, cur, ix) => {
                        acc[cur] = r[ix];
                        return acc;
                    }, {});
        
                    const geometry = {
                        "coordinates": [parseFloat(geo_lng), parseFloat(geo_lat)],
                        "type": "Point"
                    };
        
                    const rowData = {
                        id: entry_id,
                        "type": "Feature", 
                        geometry, 
                        properties, 
                    };
        
                    pdxReporterGeoData.features.push(rowData);
                });
            }
            return pdxReporterGeoData;
        };

        addGeojsonSource(
            map, 
            'pdx-reporter-src', 
            getPdxReporter,
            {
                attribution: '<a href="https://pdxreporter.webhookdb.com/">WebHookDB</a>',
            },
        );


        ////////////////////////////////////////////
        //////////// Layers ////////////////////////
        ////////////////////////////////////////////

        const pavementLayer = 'pbot-markings-layer';
        addLayerIfSourceOK(map, {
            id: pavementLayer,
            type: 'raster',
            source: 'pbot-markings',
            layout: {visibility: 'none'},
            minzoom: 17,
        }, firstSymbolId);

        
        const routesLayer = 'pbot-routes-layer';
        addLayerIfSourceOK(map, {
            id: routesLayer,
            type: 'raster',
            source: 'pbot-routes',
            paint: {
                'raster-opacity': 0.75,
            },
        }, firstSymbolId);

        const speedLimitLayer = 'pbot-speed-limit-layer';
        addLayerIfSourceOK(map, {
            id: speedLimitLayer,
            type: 'raster',
            source: 'pbot-speed-limits',
            layout: {visibility: 'none'},
        }, firstSymbolId);

        const crashLayer = 'pbot-high-crash-network';
        addLayerIfSourceOK(map, {
            id: crashLayer,
            source: 'pbot-high-crash-network-source',
            type: 'line',
            // paint: {"line-opacity": 0.5, "line-color": "rgba(251, 0, 255, 1)", "line-width": 3, "line-dasharray": [0.5, 0.5]},
            paint: {
                "line-opacity": 0.5, "line-color": "rgba(255, 0, 191, 1)", "line-dasharray": [0.5, 0.5], "line-gap-width": ["interpolate", ["exponential", 1.3],["zoom"],10,3,20,25],"line-width": ["interpolate",["exponential", 1.3],["zoom"],10,1,20,10],
            },
        }, firstSymbolId);

        const pdxOrthoLayer = 'pdx-ortho-layer';
        addLayerIfSourceOK(map, {
            id: pdxOrthoLayer, 
            type: 'raster', 
            source: 'pdx-orthos-src',
            layout: {visibility: 'none'},
        // }, firstRoadId);
        }, routesLayer);

        const esriImgLayer = 'esri-ortho-layer';
        addLayerIfSourceOK(map, {
            id: esriImgLayer,
            type: 'raster',
            source: 'esri-imagery-src',
            layout: {visibility: 'none'},
        // }, firstRoadId);
        }, routesLayer);

        const rwgpsLayer = 'rwgps-heatmap-layer';
        addLayerIfSourceOK(map, {
            id: rwgpsLayer, 
            type: 'raster', 
            source: 'rwgps-heatmap-src', 
            paint: {'raster-opacity': 0.8},
            layout: {visibility: 'none'},
        }, firstSymbolId);

        const biketownBorderLayer = 'biketown-border-layer';
        addLayerIfSourceOK(map, {
            id: `${biketownBorderLayer}-fill`,
            type: 'fill',
            source: 'biketown-border-src',
            paint: {
                'fill-color': '#000',
                'fill-opacity': 0.25,
            },
            layout: {visibility: 'none'},
        });
        addLayerIfSourceOK(map, {
            id: `${biketownBorderLayer}-line`,
            type: 'line',
            source: 'biketown-border-src',
            paint: {
                'line-color': 'rgb(252, 76, 2)',
                'line-opacity': 0.85,
                'line-width': 3,
            },
            layout: {visibility: 'none'},
        });

        const biketownBikesLayer = 'biketown-available-layer';
        addLayerIfSourceOK(map, {
            id: biketownBikesLayer,
            source: 'biketown-available-src', 
            type: 'circle', 
            paint: {
                'circle-color': '#FFF', 
                'circle-stroke-color': 'rgb(252, 76, 2)', 
                'circle-stroke-width': 2, 
                'circle-radius': 2, 
                'circle-blur': 0.2
            },
            layout: {visibility: 'none'},
            minzoom: 11,
        });

        const trimetRoutesLayer = 'trimet-routes-layer';
        const exclRoutes = [287, 288, 291, 292, 293]
        const trimetRoutesFilter = [
            "!", ["any", 
                // exclude TriMet bus bridge for max outages
                [
                    "all",
                    ["==", ["get", "route_type"], 3],
                    ["==", ["get", "feed_id"], "TRIMET"],
                    [
                        ">=", 
                        ["to-number", ["coalesce", ["get", "route_id"], ["get", "route_short_names"]], 0],
                        200
                    ],
                    [
                        "<",
                        ["to-number", ["coalesce", ["get", "route_id"], ["get", "route_short_names"]], 0],
                        300
                    ],
                ],
                // exclude routes that aren't regularly scheduled and available to the public
                [
                    "in",
                    ["get", "feed_id"],
                    ["literal", [
                        "MULT",
                        "WASH_FLEX",
                        "RIDECONNECTION",
                        "CTRAN_FLEX"
                    ]]
                ],
            ]
        ];
        const tmBusColor = "rgb(134, 105, 153)";
        const otherBusColor = "#3e5c45";
        const railStopColor = "#555555";
        const routeColor = [
            "case",
            ["!=", ["get", "route_type"], 3], ["get", "route_color"],
            ["!=", ["get", "agency_id"], "TRIMET"], otherBusColor,
            ["!=", ["get", "route_color"], "#4679AA"], ["get", "route_color"],
            tmBusColor,
        ];
        
        addLayerIfSourceOK(map, {
            id: trimetRoutesLayer,
            type: "line",
            source: "trimet-route-tiles",
            "source-layer": "current_routes",
            paint: {
                "line-color": routeColor,
                "line-width": [
                    "case",
                    ["in", ["get", "route_type"], ["literal", [0, 2, 6]]],
                    3,
                    1.5
                ],
                "line-offset": [
                    "*",
                    [
                        "case",
                        ["==", ["get", "route_type"], 0],
                        ["match", ["get", "route_id"],
                            "90", 0,    // red line
                            "100", 1,   // blue line
                            "190", -1,  // yellow line
                            "290", -1,  // orange line
                            "200", -2,  // green line
                            "193", 1,   // NS streetcar
                            "194", 1.5, // A loop streetcar
                            "195", 0.5, // B loop streetcar
                            0
                        ],
                        0
                    ],
                    5
                ],
            },
            layout: {
                "line-sort-key": ["get", "route_sort_order"],
                "line-cap": "butt",
                "line-join": "miter",
                visibility: 'none',
            },
            filter: trimetRoutesFilter,
        }, firstSymbolId);

        const trimetRtLabelLayer = 'trimet-routes-labels-layer';
        addLayerIfSourceOK(map, {
            id: trimetRtLabelLayer,
            type: "symbol",
            source: "trimet-route-tiles",
            "source-layer": "current_routes",
            filter: trimetRoutesFilter,
            layout: {
                "text-field": [
                    "coalesce",
                    ["get", "route_short_name"],
                    ["get", "route_long_name"]
                ],
                "text-size": 12,
                "symbol-placement": "line",
                // "text-keep-upright": true,
                "text-rotation-alignment": "map",
                /*
                "text-font": [
                    "Open Sans Bold",
                    "Arial Unicode MS Bold",
                    "Open Sans Regular",
                    "Arial Unicode MS Regular"
                ],
                */
                "visibility": "none",
            },
            paint: {
                "text-halo-color": routeColor,
                "text-color": [
                    "case",
                    ["!=", ["get", "agency_id"], "TRIMET"], "#FFFFFF",
                    ["get", "route_text_color"]
                ],
                "text-halo-width": 2,
            },
        });

        const trimetStopsLayer = 'trimet-stops-layer';
        addLayerIfSourceOK(map, {
            id: trimetStopsLayer,
            type: 'circle',
            source: 'trimet-stop-tiles',
            'source-layer': 'current_stops',
            layout: {
                visibility: 'none',
            },
            filter: trimetRoutesFilter,
            paint: {
                "circle-color": "#FFFFFF",
                "circle-stroke-color": [
                    "case",
                    ["!=", ["get", "route_type"], 3],
                    railStopColor,
                    ["==", ["get", "feed_id"], "TRIMET"],
                    tmBusColor,
                    otherBusColor,
                ],
                "circle-stroke-width": [
                    "case",
                    ["!=", ["get", "route_type"], 3],
                    4, 3,
                ],
                "circle-radius": [
                    "case",
                    ["!=", ["get", "route_type"], 3],
                    3, 2,
                ],
            },
        });

        const pdxReporterLayerBaseConfig = {
            type: 'circle', 
            source: 'pdx-reporter-src',
            layout: {visibility: 'none'},
            minzoom: 12,
        };

        const pdxReporterLayer = 'pdx-reporter-points';
        addLayerIfSourceOK(map, {
            ...pdxReporterLayerBaseConfig,
            id: pdxReporterLayer, 
            paint: {
                "circle-color": [
                    "match",
                    ["get", "status"],
                    "Closed",
                    "green",
                    "Referred",
                    "purple",
                    "Work In Progress",
                    "gold",
                    "#f23c0a"
                ],
                "circle-radius": {
                    "stops": [[12, 2], [14, 5]],
                    "type": "exponential"
                },
                "circle-stroke-width": 0.1
            },
        });

        // Invisible layer used to detect hover events with larger target
        const pdxReporterHoverLayer = 'pdx-reporter-hover';
        addLayerIfSourceOK(map, {
            ...pdxReporterLayerBaseConfig,
            id: pdxReporterHoverLayer, 
            paint: {
                "circle-opacity": 0,
                "circle-stroke-width": 0,
                // "circle-stroke-width": 0.1,
                // "circle-stroke-color": "#000000",
                "circle-radius": 20,
            },
        });

        const stopSignLayer = 'pbot-stopsigns-layer';
        addLayerIfSourceOK(map, {
            id: stopSignLayer,
            type: 'symbol',
            source: 'pbot-stopsigns-source',
            layout: {
                'icon-image': 'stop-sign-img',
                'icon-size': [
                    'interpolate',
                    ['exponential', 2],
                    ['zoom'],
                    16, 0.8,
                    22, 3,
                ],
                'icon-rotate': ["-", 90, ['get', 'Rotation']],
                'icon-rotation-alignment': 'map',
                'icon-overlap': 'cooperative',
                'icon-ignore-placement': true,
            },
            paint: {
                'icon-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    16, 0.5,
                    22, 1.0,
                ],
            },
            minzoom: signsMinZoom,
        });

        const signalsLayer = 'pbot-signals-layer';
        const signalScaling = [
            "interpolate",
            ["linear"],
            ["zoom"],
            0, 0.1,
            10, 0.33,
            16, 0.5,
            18, 1.0,
        ];
        addLayerIfSourceOK(map, {
            id: signalsLayer,
            type: 'symbol',
            source: 'pbot-signals-source',
            layout: {
                'icon-image': 'traffic-signal-img',
                'icon-overlap': 'always',
                'icon-size': signalScaling,
                'icon-ignore-placement': true,
            },
            paint: {
                'icon-opacity': 0.6,
            },
            minzoom: signalsMinZoom,
        });

        const bikeSignLayer = 'pbot-bikesigns-layer';
        addLayerIfSourceOK(map, {
            id: bikeSignLayer, 
            type: 'symbol', 
            source: 'pbot-bikesigns-source',
            layout: {
                'icon-image': 'bike-route-img',
                'icon-size': 1,
                'icon-rotate': ["-", 90, ['get', 'Rotation']],
                'icon-rotation-alignment': 'map',
                'icon-overlap': 'always',
                'icon-ignore-placement': true,
            },
            // minzoom: signsMinZoom,
            minzoom: 14,
        });
        
        const rrfbLayer = 'pbot-rrfb-layer';
        addLayerIfSourceOK(map, {
            id: rrfbLayer,
            type: 'symbol',
            source: 'pbot-rrfb-src',
            layout: {
                'icon-image': 'rrfb-img',
                'icon-size': signalScaling,
                'icon-overlap': 'always',
                'icon-ignore-placement': true,
            },
            paint: {
                'icon-opacity': 0.8,
            },
            minzoom: signalsMinZoom,
        });


        ////////////////////////////////////////////
        //////////// Map Interactivity /////////////
        ////////////////////////////////////////////

        // On-hover pop-ups of PDX Reporter issues
        const pdxReporterPopup = new maplibregl.Popup({closeButton: true, closeOnClick: true, className: 'pdx_reporter_popup'});
        let currentHoveredReportCoords = undefined;
        let mostRecentHoverEvent = undefined;
        // Activate when target layer is hovered (desktop) or tapped (mobile)
        onHoverOrTap(map, pdxReporterHoverLayer, (e) => {
            const featureCoordinates = e.features[0].geometry.coordinates.toString();
            if (currentHoveredReportCoords !== featureCoordinates) {
                console.log('opening popup', e);
                mostRecentHoverEvent = e.originalEvent;
                currentHoveredReportCoords = featureCoordinates;
                map.getCanvas().style.cursor = 'pointer';
                
                const coordinates = e.features[0].geometry.coordinates.slice();
                const properties = e.features[0].properties;

                const t = document.createElement('h2');
                t.innerText = properties.title;
                const d = document.createElement('p');
                d.innerText = properties.published;
                const c = document.createElement('p');
                c.innerText = `Category: ${properties.category}`;
                const s = document.createElement('p');
                s.innerText = `Status: ${properties.status}`;
                const a = document.createElement('p');
                a.innerText = properties.address;
                const n = document.createElement('p');
                n.innerText = properties.comment;

                const div = document.createElement('div');
                div.appendChild(t);
                div.appendChild(c);
                div.appendChild(s);
                div.appendChild(a);
                div.appendChild(d);
                div.appendChild(n);

                pdxReporterPopup.setLngLat(coordinates).setDOMContent(div).addTo(map);
            }
        });

        // If the user moves the pointer into the popup, it should remain open to allow for scrolling/interaction
        // If the user directly moves the pointer off the marker and not into the popup, or after they move 
        // the pointer out of the popup later, then the popup should be closed.
        const onPdxReporterPointUnhovered = (e) => {
            currentHoveredReportCoords = undefined;
            map.getCanvas().style.cursor = '';
            const popupElement = pdxReporterPopup.getElement();
            const movedToPopup = popupElement?.contains(e.originalEvent?.toElement);
            // console.debug('popupElement', popupElement);
            // console.debug('movedToPopup', movedToPopup);
            if (movedToPopup) {
                pdxReporterPopup.getElement().addEventListener('mouseleave', () => {
                    // console.debug('popup mouse leave; closing');
                    pdxReporterPopup.remove();
                });
            } else {
                pdxReporterPopup.remove(); 
            }
        }
        // For desktop devices, mouseleave fires when user unhovers
        map.on('mouseleave', pdxReporterHoverLayer, onPdxReporterPointUnhovered);
        // For mobile devices, there is no "unhover" event, and closeOnClick is incompatible 
        // on touch devices with the drawing plugin used for measurements. 
        // Instead, check for any tap anywhere on the map (not limited to this layer).
        // This event will fire immediately after the layer-specific touchstart event, which 
        // would immediately close the newly-created popup. To prevent this, log and check 
        // that the underlying touch event is not the same as the one that created the popup.
        map.on('touchstart', (e) => {
            if (pdxReporterPopup.isOpen() && e.originalEvent !== mostRecentHoverEvent && !map.isMoving()) {
                // console.log('touch start with active popup', e);
                const initialCoords = currentHoveredReportCoords;
                setTimeout(() => {
                        if (!map.isMoving() && currentHoveredReportCoords == initialCoords) {
                            onPdxReporterPointUnhovered(e);
                        }
                }, 100);
            }
        });

        // PBOT bike route guidance signs pop-ups
        // Pop-up displays when hovered, stays open and zooms in to perspective facing the sign when clicked

        const routePopup = new maplibregl.Popup({closeButton: true, closeOnClick: false, closeOnMove: false});
        window.routePopup = routePopup;
        let hasLeftAfterClosing = true;
        let currentHoveredSignCoords = undefined;
        let currentClickedSignCoords = undefined;
        let currentHoveredSignFeature = undefined;
        let pitchBearingBeforeZoom = [0, 0];

        // Reset camera angle when exiting pop-up if camera hasn't been moved since zooming into the sign
        routePopup.on('close', (e) => {
            if (!currentHoveredSignCoords && !pitchBearingBeforeZoom.every(Boolean)) {
                map.easeTo({
                    bearing: 0,
                    pitch: 0,
                });
            }
            currentHoveredSignCoords = false;
        });

        // Detect when user pitches or rotates camera, so camera will stay at new position when closing popup
        map.on('pitchend', (e) => {
            if (e.originalEvent) {
                pitchBearingBeforeZoom = [map.getPitch(), map.getBearing()];
            }
        });
        map.on('rotateend', (e) => {
            if (e.originalEvent) {
                pitchBearingBeforeZoom = [map.getPitch(), map.getBearing()];
            }
        });        

        // Route sign hover logic: display the popup with the current sign code's image
        // Hovering over a new sign when an existing one was clicked into clears the "clicked" state
        onHoverOrTap(map, bikeSignLayer, (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const feature = e.features[0];
            const featureCoordinates = feature.geometry.coordinates.toString();
            if (hasLeftAfterClosing && currentHoveredSignCoords !== featureCoordinates) {
                mostRecentHoverEvent = e.originalEvent;
                currentHoveredSignCoords = featureCoordinates;
                currentHoveredSignFeature = feature;

                if (currentClickedSignCoords !== featureCoordinates) {
                    currentClickedSignCoords = undefined;
                }

                const coordinates = e.features[0].geometry.coordinates.slice();
                const signCode = e.features[0].properties.SignCode;
                const img = new Image();
                img.src = `https://pbotapps.blob.core.windows.net/sign-library/${signCode}%40128.png`;
                routePopup.setLngLat(coordinates).setDOMContent(img).addTo(map);
                routePopup.getElement().querySelector('img').addEventListener('touchstart', (e) => {
                    console.log('tapped popup from touchstart listener in creator');
                    onRouteSignClicked(e);
                });
            }
        });

        // If a route sign is hovered only, close when mouse leaves (hover ends)
        // If the sign was clicked on, leave it open, but track it's no longer hovered
        const onRoutePopupClose = (e) => {
            if (!currentClickedSignCoords || e.type === 'touchstart') {
                routePopup.remove();
            }
            map.getCanvas().style.cursor = '';
            hasLeftAfterClosing = true;
            currentHoveredSignCoords = undefined;
        };

        // Desktop browsers: close popup when no longer hovered
        map.on('mouseleave', bikeSignLayer, onRoutePopupClose);
        // Touch devices: close popup when tapped elsewhere on map
        map.on('touchstart', (e) => {
            if (routePopup.isOpen() && e.originalEvent !== mostRecentHoverEvent && !map.isMoving()) {
                console.log('touch start with active popup', e);
                const initialCoords = currentHoveredSignCoords;
                setTimeout(() => {
                        if (!map.isMoving() && currentHoveredSignCoords == initialCoords) {
                            onRoutePopupClose(e);
                        }
                }, 100);
            }
        });

        // If a route sign is clicked on, leave it open, and zoom in to its position
        // If clicked again, close the pop-up
        const onRouteSignClicked = (e) => {
            let clickedFeature = e.features && e.features[0] || currentHoveredSignFeature;
            const clickedFeatureCoordinates = clickedFeature?.geometry.coordinates.toString();
            if (clickedFeatureCoordinates && currentClickedSignCoords === clickedFeatureCoordinates) {
                // close it if clicked out, reset camera if tapped on
                currentClickedSignCoords = undefined;
                if (e.type === 'touchstart') {
                    map.easeTo({
                        bearing: 0,
                        pitch: 0,
                    });
                } else {
                    currentHoveredSignCoords = undefined;
                    routePopup.remove();
                    hasLeftAfterClosing = false;
                    curPitchBearing = [map.getPitch(), map.getBearing()];
                }
            } else {
                // adjust the map
                pitchBearingBeforeZoom = [map.getPitch(), map.getBearing()];
                currentClickedSignCoords = clickedFeatureCoordinates;
                const bearing = -1 * (clickedFeature.properties.Rotation) + 90;
                map.easeTo({
                    center: clickedFeature.geometry.coordinates,
                    zoom: 19.5,
                    pitch: 60,
                    bearing,
                });
            }
        };

        map.on('click', bikeSignLayer, onRouteSignClicked);


        ////////////////////////////////////////////
        //////////// Map legends ///////////////////
        ////////////////////////////////////////////

        // Common SVG shapes to be used for custom legend icons
        const lineSvgData = "PHN2ZyB2aWV3Qm94PSIwIDAgMjAgMjAiIHByZXNlcnZlQXNwZWN0UmF0aW89InhNaWRZTWlkIG1lZXQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGxpbmUgeDE9IjAiIHkxPSIxMCIgeDI9IjIwIiB5Mj0iMTAiPjwvbGluZT48L3N2Zz4=";
        const doubleLineSvgData = "PHN2ZyB2aWV3Qm94PSIwIDAgMjAgMjAiIHByZXNlcnZlQXNwZWN0UmF0aW89InhNaWRZTWlkIG1lZXQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGxpbmUgeDE9IjAiIHkxPSI1IiB4Mj0iMjAiIHkyPSI1Ij48L2xpbmU+PGxpbmUgeDE9IjAiIHkxPSIxNSIgeDI9IjIwIiB5Mj0iMTUiPjwvbGluZT48L3N2Zz4=";
        const circleSvgData = "PHN2ZyB2aWV3Qm94PSIwIDAgMjAgMjAiIHByZXNlcnZlQXNwZWN0UmF0aW89InhNaWRZTWlkIG1lZXQiPjxjaXJjbGUgY3g9IjEwIiBjeT0iMTAiIHI9IjEwIiAvPjwvc3ZnPg==";


        // Legend for PBOT recommended bike routes layer must be generated from the feature server,
        // as the layer is rendered fully server-side
        const rtLayerConfig = {
            id: routesLayer,
            visible: true,
            title: 'PBOT Recommended Bicycle Routes',
            showCheckbox: true,
            icons: [],
        };
        const rtLegendLayers = [4];
        window.routesService = routesService;
        await routesService.generateLegend().then(rtLegend => {
            rtLegend.forEach((layer) => {
                if (rtLegendLayers.includes(layer.layerId)) {
                    layer.legend.forEach((l) => {
                        rtLayerConfig.icons.push({
                            label: l.label,
                            element: 'img',
                            content: `data:${l.contentType};base64,${l.imageData}`,
                        });
                    });
                }
            });
        }).catch(err => {
            console.error('Error generating legend for routes layer:', err);
            rtLayerConfig.icons.push({
                label: 'Unable to load legend',
            });
        });
        // Update speed limit layer styling before generating legend
        await fetch('data/speed-limit-dynamic-layers.json').then(r => r.json()).then(
            j => speedLimitService.setDynamicLayers(j)).catch(console.error);

        // Legend for speed limits layer must be generated from the feature server,
        // as the layer is rendered fully server-side
        const slLayerConfig = {
            id: speedLimitLayer,
            visible: false,
            title: 'PBOT Speed Limits',
            showCheckbox: true,
            icons: [],
        };
        await speedLimitService.generateLegend().then(slLegend => {
            const slLegendLayers = [55,56];
            slLegend.forEach((layer) => {
                if (slLegendLayers.includes(layer.layerId)) {
                    layer.legend.forEach((l) => {
                        slLayerConfig.icons.push({
                            label: l.label || layer.layerName,
                            element: 'img',
                            content: `data:${l.contentType};base64,${l.imageData}`,
                        });
                    });
                }
            });
        }).catch(err => {
            console.error('Error loading speed limits legend:', err);
            slLayerConfig.icons.push({
                label: 'Unable to load legend',
            });
        });
        

        // Legend config is built manually to control labels and styling for clarity
        // If "showCheckbox" is enabled or "visible" is disabled, "id" must match a layer,
        // and will be used to toggle the layer visibility
        // Layer title is required and is always shown. Layer may optionally contain icons.
        // Checkbox is only shown at the layer level, and toggles everything on/off for that layer. 
        // Icons can be an img or svg, if svg styling can be applied. 
        // Layer ID can be a single string or an array of strings. If an array of strings, all
        // layers will be toggled together
        const layerConfig = [
            {
                id: [signalsLayer, stopSignLayer, bikeSignLayer, rrfbLayer],
                title: 'Signs & Signals',
                visible: true,
                showCheckbox: true,
                icons: [{
                    label: 'Bike Direction Sign',
                    element: 'img',
                    content: bikeSignImg,
                }, {
                    label: 'Stop Signs',
                    element: 'img',
                    content: stopSignImg,
                }, {
                    label: 'Traffic Signals',
                    element: 'img',
                    content: signalImg,
                }, {
                    label: 'Flashing Crosswalk & Intersection Signals',
                    element: 'img',
                    content: rrfbImg,
                }],
            }, 
            {
                id: crashLayer,
                visible: true,
                title: 'High Crash Network',
                showCheckbox: true,
                icons: [{
                    label: 'High Crash Network',
                    element: 'svg',
                    content: doubleLineSvgData,
                    style: {
                        'stroke': 'magenta',
                        'stroke-dasharray': '1.5 1.5',
                        'stroke-linecap': 'butt',
                        'stroke-width': 2,
                    },
                }],
            },
            rtLayerConfig,
            {
                id: [pdxReporterLayer, pdxReporterHoverLayer],
                visible: false,
                title: 'Recent PDX Reporter Issues',
                showCheckbox: true,
                icons: [
                    {
                        label: 'Open Issue',
                        element: 'svg',
                        content: circleSvgData,
                        style: {'fill': '#f23c0a'},
                    },
                    {
                        label: 'Closed Issue',
                        element: 'svg',
                        content: circleSvgData,
                        style: {'fill': 'green'},
                    },
                    {
                        label: 'Issue Referred',
                        element: 'svg',
                        content: circleSvgData,
                        style: {'fill': 'purple'},
                    },
                    {
                        label: 'Issue in Progress',
                        element: 'svg',
                        content: circleSvgData,
                        style: {'fill': 'gold'},
                    },
                ],
            },
            {
                id: pdxOrthoLayer,
                visible: false,
                title: 'PortlandMaps Aerial Images 2025',
                showCheckbox: true,
                icons: [],
            },
            {
                id: esriImgLayer,
                visible: false,
                title: 'ESRI World Imagery Service',
                showCheckbox: true,
                icons: [],
            },
            {
                id: pavementLayer,
                visible: false,
                title: 'PBOT Pavement Markings',
                showCheckbox: true,
                icons: [],
            },
            slLayerConfig,
            {
                id: rwgpsLayer,
                visible: false,
                title: 'RideWithGPS Heatmap',
                showCheckbox: true,
                icons: [{
                    label: 'Heatmap',
                    element: 'svg',
                    content: lineSvgData,
                    style: {
                        'stroke': '#ff00007d',
                        'stroke-width': 3,
                        'filter': 'drop-shadow(0px 0px 2px red)',
                    },
                }],
            },
            {
                id: [`${biketownBorderLayer}-fill`, `${biketownBorderLayer}-line`, biketownBikesLayer],
                visible: false,
                title: 'Biketown Service Area',
                showCheckbox: true,
                icons: [{
                    label: 'Service area',
                    element: 'svg',
                    content: lineSvgData,
                    style: {
                        'stroke': 'rgb(252, 76, 2)',
                        'stroke-width': 5,
                    },
                }, {
                    label: 'Available bikes',
                    element: 'svg',
                    content: circleSvgData,
                    style: {
                        'stroke': 'rgb(252, 76, 2)',
                        'stroke-width': 7,
                        'fill': '#FFF',
                        'transform': 'scale(0.7)',
                    },
                }],
            },
            {
                id: [trimetRoutesLayer, trimetRtLabelLayer, trimetStopsLayer],
                visible: false,
                title: 'Public Transit',
                showCheckbox: true,
                icons: [
                    {
                        label: 'TriMet Bus Lines',
                        element: 'svg',
                        content: lineSvgData,
                        style: {
                            'stroke': tmBusColor,
                            'stroke-width': 4,
                        },
                    },
                    {
                        label: 'Other Bus Lines',
                        element: 'svg',
                        content: lineSvgData,
                        style: {
                            'stroke': otherBusColor,
                            'stroke-width': 4,
                        },
                    },
                ],
            },
        ];

        const legend = document.querySelector('.sidebar .legend_main_layers');
        generateLegend(map, legend, layerConfig);

        // Fetching and applying the dynamic layers takes a moment, so we do this last
        await fetch('data/pbot-assets-dynamic-layers.json').then(r => r.json()).then(
            j => markingsService.setDynamicLayers(j)).catch(console.error);

        // Set up dynamic legend for TriMet layers, loaded from vector tiles
        const trimetLegendEntries = {};
        map.on('sourcedata', (e) => {
            if (e.sourceId === 'trimet-route-tiles' && e.isSourceLoaded) {
                const newLegendIcons = map
                    .querySourceFeatures('trimet-route-tiles', {sourceLayer: 'current_routes'})
                    .map(f => f.properties)
                    .filter(p => [0, 2].includes(p.route_type))
                    .reduce((acc, cur) => {
                        if (!trimetLegendEntries[cur.route_long_name]) {
                            acc[cur.route_long_name] = cur.route_color;
                        }
                        return acc;
                    }, {}
                );
                Object.assign(trimetLegendEntries, newLegendIcons);
                Object.entries(newLegendIcons).map(([rt, c]) => {
                    return {
                        label: rt,
                        element: 'svg',
                        content: lineSvgData,
                        style: {
                            'stroke': c,
                            'stroke-width': 4,
                        },
                    };
                }).forEach(ic => {
                    const tmIcons = legend.querySelector('[class*="trimet-routes-layer"] .icons');
                    generateIcon(ic, tmIcons);
                    [...tmIcons.children].slice(2).sort((a, b) => {
                        const txtA = a.querySelector('.iconlabel').innerText;
                        const txtB = b.querySelector('.iconlabel').innerText;
                        return txtA > txtB ? 1 : -1;
                    }).forEach(node => tmIcons.appendChild(node));
                });
            }
        });
    });
});

// Retrieves all data from paginated ESRI/ArcGIS FeatureServer or MapServer,
// up to the specified page limit
async function getAllPagesFromService(url, searchParams, maxPages = 20) {
    const u = new URL(url);
    const p = u.searchParams;
    p.delete('resultOffset');
    p.delete('resultRecordCount');
    if (!p.has('f')) {
        p.set('f', 'geojson');
    }
    Object.entries(searchParams || {}).forEach(([k, v]) => {
        p.set(k, v);
    });
    
    let pages = 0;
    let offset = 0;
    let count = 0;
    const responses = [];
    let data;
    do {
        try {
            console.debug(u.toString());
            data = await fetch(u).then(r => r.json());
        } catch (err) {
            console.error(err);
            break; 
        }
        if (!data || !data.features) {
            console.error('expected to receive features data', data);
            break;
        }
        responses.push(data);
        count = data.features.length;
        offset += count;
        pages++;
        u.searchParams.set('resultOffset', offset);
        u.searchParams.set('resultRecordCount', count);
    } while(data.exceededTransferLimit && pages <= maxPages);
    return turf.featureCollection(responses.map(d => d.features).flat());
}

// Add a geojson source to the map with empty data, and defer loading the data
// to an async function that will update the data once available. Useful when 
// the source data isn't a simple GeoJSON URL but needs some kind of processing 
// after being loaded, but don't want to hold up the main thread while it loads.
// dataFunc must be an async function that returns GeoJSON data.
// config is passed directly to addSource.
function addGeojsonSource(map, id, dataFunc, config) {
    map.addSource(id, {
        type: 'geojson',
        ...config,
        data: turf.featureCollection([]),
    });

    dataFunc().then(d => {
        console.debug('loaded data for', id, d);
        map.getSource(id).setData(d);
    }).catch((err) => {
        console.error('Error loading', id, err);
    });
}

// Combines the two functions above, adding an empty GeoJSON source to the map, 
// then fetching all pages from an ESRI FeatureService and updating the source 
function addSourceFromService(map, id, url, config, searchParams, maxPages = 20) {
    addGeojsonSource(map, id, () => getAllPagesFromService(url, searchParams, maxPages), config);
}

// Adds a layer only if the source exists on the map
function addLayerIfSourceOK(map, data, ...args) {
    if (map.getSource(data.source)) {
        map.addLayer(data, ...args);
    }
}

function generateLegend(map, container, layerConfig) {
    layerConfig.forEach(layer => {
        // Create containers
        const layerLi = document.createElement('li');
        const layerDiv = document.createElement('div');
        const layerTitle = document.createElement('div');
        const iconsList = document.createElement('ul');

        // Configure containers
        layerLi.classList.add('layer');
        layerLi.classList.add(layer.id);
        layerDiv.classList.add('layerInfo');
        layerTitle.classList.add('layerTitle');
        iconsList.classList.add('icons');
        
        // Add containers
        container.appendChild(layerLi);
        layerLi.appendChild(layerDiv);   
        
        // Used to toggle visibility of icons
        const hideClass = 'hide-icons';

        // Configure checkbox
        let layerCheckbox;

        if (layer.showCheckbox) {
            layerCheckbox = document.createElement('input');
            layerCheckbox.type = 'checkbox';
            if (layer.visible) {
                layerCheckbox.checked = layer.visible;
            } else {
                iconsList.classList.add(hideClass);
            }
            layerDiv.appendChild(layerCheckbox);
            setLayersVisible(layer.id, layer.visible);
            layerCheckbox.addEventListener('change', (e) => {
                // console.log('checkbox changed', e.target.checked, e);
                const checked = e.target.checked;
                setLayersVisible(layer.id, checked);
                if (!checked) {
                    iconsList.classList.add(hideClass);
                }
                if (layer.callback) {
                    layer.callback(checked);
                }
            });
        }

        // Add content
        layerDiv.appendChild(layerTitle);
        layerTitle.innerText = layer.title;

        // Configure icons
        const hasIcons = layer.icons?.length;
        if (hasIcons) {
            layerLi.appendChild(iconsList);
            layer.icons.forEach(icon => generateIcon(icon, iconsList));
        }

        // Handle click to collapse details
        layerTitle.addEventListener('click', (e) => {
            if (hasIcons) {
                if (iconsList.classList.contains(hideClass)) {
                    iconsList.classList.remove(hideClass);
                    if (layerCheckbox && !layerCheckbox.checked) layerCheckbox.click();
                } else {
                    iconsList.classList.add(hideClass);
                }
            } else if (layerCheckbox) {
                // layerCheckbox.checked = !layerCheckbox.checked;
                layerCheckbox.click();
            }
        });
    });
}

function setLayersVisible(layerIds, visible) {
    layerIds = Array.isArray(layerIds) ? layerIds : [layerIds];
    layerIds.forEach(l => {
        map.setLayoutProperty(l, 'visibility', visible ? 'visible' : 'none');
    });
}

function generateIcon(icon, container) {
    // Create elements
    const iconItem = document.createElement('li');
    const imgDiv = document.createElement('div');
    const labelDiv = document.createElement('div');
    
    // Configure label
    labelDiv.innerText = icon.label;
    labelDiv.classList.add('iconlabel');

    // Configure image
    imgDiv.classList.add('iconwrapper');

    let imgElement;
    if (icon.element == 'svg' && icon.content) {
        const tmp = document.createElement('template');
        tmp.innerHTML = atob(icon.content);
        imgElement = tmp.content.firstChild;
    } else if (icon.element == 'img' && icon.content) {
        imgElement = new Image();
        imgElement.src = icon.content;

        /*
        if (icon.content.startsWith('mapImage::')) {
            const imgData = map.getImage(icon.content.split('mapImage::')[1]);
            imgElement.src = URL.createObjectURL(new Blob([imgData.data.data.buffer]));
        } else {
            imgElement.src = icon.content;
            imgElement.src = icon.content;
        }
        */
    } else {
        console.error('unrecognized icon config:', icon);
    }

    if (imgElement) {
        imgDiv.appendChild(imgElement);
        Object.entries(icon.style || {}).forEach(([k, v]) => 
            imgElement.style.setProperty(k, v)
        );
    }

    // Add items
    container.appendChild(iconItem);
    iconItem.appendChild(imgDiv);
    iconItem.appendChild(labelDiv);
}

function onHoverOrTap(map, layerId, callback) {
    // Hover/mousemove doesn't work on mobile devices, so we need to check for both hover (desktop) and touchstart (mobile) events
    map.on('mousemove', layerId, callback);
    map.on('touchstart', layerId, (e) => {
        // don't open popup if more than one touch point, which indicates zooming/panning
        if (e.points.length > 1) return;
        // must save and restore features as they get lost after timeout
        const feats = e.features;
        // wait a moment before opening the popup, and make sure the user isn't doing a movement
        setTimeout(() => {
                if (!map.isMoving()) {
                    e.features = feats;
                    callback(e);
                }
        }, 100);
    });
}

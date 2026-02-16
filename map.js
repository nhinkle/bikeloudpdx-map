document.addEventListener('DOMContentLoaded', () => {

    const srcBoundOptions = {
        bounds: [-122.8553775, 45.4314992, -122.4235556, 45.6505841],
    };

    const map = new maplibregl.Map({
        container: 'map',
        // style: 'https://tiles.openfreemap.org/styles/positron',
        // style: 'https://tiles.openfreemap.org/styles/liberty',
        style: 'data/efsry9v.json',
        // center: [-122.5927, 45.4885],
        // zoom: 11,
        bounds: srcBoundOptions.bounds,
        hash: true,
    });

    // to facilitate testing/development
    window.map = map;

    // Add zoom and rotation controls to the map.
    map.addControl(new maplibregl.NavigationControl({
        visualizePitch: true,
        visualizeRoll: true,
        showZoom: true,
        showCompass: true
    }));



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
        const signalImg = 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Twemoji2_1f6a6.svg/64px-Twemoji2_1f6a6.svg.png';
        await map.loadImage(signalImg).then(img => {
            const scale = Math.max(img.data.width, img.data.height) / 24;
            map.addImage('traffic-signal-img', img.data, {pixelRatio: scale});
        }, err => {
            throw err;
        });

        // Stop sign icon
        const stopSignImg = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Stop_sign%28standard%29.svg/64px-Stop_sign%28standard%29.svg.png?20250111013546';
        await map.loadImage(stopSignImg).then(img => {
            const scale = Math.max(img.data.width, img.data.height) / 16;
            map.addImage('stop-sign-img', img.data, {pixelRatio: scale});
        }, err => {
            throw err;
        });

        // Bike route sign icon
        const bikeSignImg = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Dv11.png/64px-Dv11.png?20150105204918';
        await map.loadImage(bikeSignImg).then(img => {
            const scale = Math.max(img.data.width, img.data.height) / 16;
            map.addImage('bike-route-img', img.data, {pixelRatio: scale});
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
        map.addSource('pbot-high-crash-network-source', {
            type: 'geojson',
            data: 'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Transportation/MapServer/209/query?f=geojson',
            attribution: pbotAttrib,
        });

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
        
        // PBOT traffic signals
        const signalsMinZoom = 14;
        const signalsSrc = await new esrigl.FeatureService(
            'pbot-signals-source', 
            map, 
            {
                url: 'https://www.portlandmaps.com/arcgis/rest/services/Public/PBOT_Assets/MapServer/199',
                useVectorTiles: false,
                useBoundingBox: true,
            },
            {
                ...srcBoundOptions,
                minzoom: signalsMinZoom,
            },
        );

        // PBOT stop signs
        const signsMinZoom = 16;
        const stopSignsSource = await new esrigl.FeatureService(
            'pbot-stopsigns-source', 
            map, 
            {
                url: 'https://www.portlandmaps.com/arcgis/rest/services/Public/PBOT_Assets/MapServer/100',
                useVectorTiles: false,
                useBoundingBox: true,
                where: "SIGNCODE IN ('R1010','R1011')",
                outFields: 'rotation',
            },
            {
                ...srcBoundOptions,
                minzoom: signsMinZoom,
                attribution: pbotAttrib,
            },
        );

        // PBOT bike routing signs
        const bikeSignsSource = await new esrigl.FeatureService(
            'pbot-bikesigns-source', 
            map, 
            {
                url: 'https://www.portlandmaps.com/arcgis/rest/services/Public/PBOT_Assets/MapServer/102',
                useVectorTiles: false,
                useBoundingBox: true,
                where: "SIGNCODE LIKE 'S5%'",
                outFields: 'signcode,rotation',
            },
            {
                ...srcBoundOptions,
                // minzoom: signsMinZoom,
                minzoom: 12,
                attribution: pbotAttrib,
            },
        );



        // PDX Reporter data from webhookdb
        // Raw json format must be reshaped into GeoJSON for proper use as a map source
        const pdxReporterData = await fetch('https://api.webhookdb.com/v1/saved_queries/svq_23en3z2idq56ktlc2ivb4x6ri/run').then(r => r.json());
        pdxReporterGeoData = {"type": "FeatureCollection", "features": []};
        pdxReporterData.rows.forEach(r => {
            const {geo_lat, geo_lng, ...properties} = pdxReporterData.headers.reduce((acc, cur, ix) => {
                acc[cur] = r[ix];
                return acc;
            }, {});
            
            const geometry = {
                "coordinates": [parseFloat(geo_lng), parseFloat(geo_lat)],
                "type": "Point"
            };

            const rowData = {geometry, properties, "type": "Feature"};
            pdxReporterGeoData.features.push(rowData);
        });
        
        map.addSource('pdx-reporter-src', {
            type: 'geojson',
            data: pdxReporterGeoData,
            attribution: '<a href="https://pdxreporter.webhookdb.com/">WebHookDB</a>',
        });

        ////////////////////////////////////////////
        //////////// Layers ////////////////////////
        ////////////////////////////////////////////

        const pavementLayer = 'pbot-markings-layer';
        map.addLayer({
            id: pavementLayer,
            type: 'raster',
            source: 'pbot-markings',
            minzoom: 17,
        }, firstSymbolId);

        
        const routesLayer = 'pbot-routes-layer';
        map.addLayer({
            id: routesLayer,
            type: 'raster',
            source: 'pbot-routes',
            paint: {
                'raster-opacity': 0.75,
            },
        }, firstSymbolId);


        const crashLayer = 'pbot-high-crash-network';
        map.addLayer({
            id: crashLayer,
            source: 'pbot-high-crash-network-source',
            type: 'line',
            // paint: {"line-opacity": 0.5, "line-color": "rgba(251, 0, 255, 1)", "line-width": 3, "line-dasharray": [0.5, 0.5]},
            paint: {
                "line-opacity": 0.5, "line-color": "rgba(255, 0, 191, 1)", "line-dasharray": [0.5, 0.5], "line-gap-width": ["interpolate", ["exponential", 1.3],["zoom"],10,3,20,25],"line-width": ["interpolate",["exponential", 1.3],["zoom"],10,1,20,10],
            },
        }, firstSymbolId);

        const pdxOrthoLayer = 'pdx-ortho-layer';
        map.addLayer({
            id: pdxOrthoLayer, 
            type: 'raster', 
            source: 'pdx-orthos-src',
        // }, firstRoadId);
        }, routesLayer);

        const esriImgLayer = 'esri-ortho-layer';
        map.addLayer({
            id: esriImgLayer,
            type: 'raster',
            source: 'esri-imagery-src',
        // }, firstRoadId);
        }, routesLayer);

        const rwgpsLayer = 'rwgps-heatmap-layer';
        map.addLayer({
            id: rwgpsLayer, 
            type: 'raster', 
            source: 'rwgps-heatmap-src', 
            paint: {'raster-opacity': 0.8}
        }, firstSymbolId);
        
        const pdxReporterLayer = 'pdx-reporter-points';
        map.addLayer({
            id: pdxReporterLayer, 
            type: 'circle', 
            source: 'pdx-reporter-src',
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
            minzoom: 12,
        });

        const signalsLayer = 'pbot-signals-layer';
        map.addLayer({
            id: signalsLayer,
            type: 'symbol',
            source: 'pbot-signals-source',
            layout: {
                'icon-image': 'traffic-signal-img',
                'icon-size': 1,
            },
            paint: {
                'icon-opacity': 0.6,
            },
            minzoom: signalsMinZoom,
        });

        const stopSignLayer = 'pbot-stopsigns-layer';
        map.addLayer({
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

        const bikeSignLayer = 'pbot-bikesigns-layer';
        map.addLayer({
            id: bikeSignLayer, 
            type: 'symbol', 
            source: 'pbot-bikesigns-source',
            layout: {
                'icon-image': 'bike-route-img',
                'icon-size': 1,
                'icon-rotate': ["-", 90, ['get', 'Rotation']],
                'icon-rotation-alignment': 'map',
                'icon-overlap': 'always',
            },
            // minzoom: signsMinZoom,
            minzoom: 14,
        });


        ////////////////////////////////////////////
        //////////// Map Interactivity /////////////
        ////////////////////////////////////////////

        // On-hover pop-ups of PDX Reporter issues
        const pdxReporterPopup = new maplibregl.Popup({closeButton: false, closeOnClick: false, className: 'pdx_reporter_popup'});
        let currentHoveredReportCoords = undefined;
        map.on('mousemove', pdxReporterLayer, (e) => {
            const featureCoordinates = e.features[0].geometry.coordinates.toString();
            if (currentHoveredReportCoords !== featureCoordinates) {
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

        map.on('mouseleave', pdxReporterLayer, () => {
            currentHoveredReportCoords = undefined;
            map.getCanvas().style.cursor = '';
            pdxReporterPopup.remove();
        });

        // PBOT bike route guidance signs pop-ups
        // Pop-up displays when hovered, stays open and zooms in to perspective facing the sign when clicked

        const routePopup = new maplibregl.Popup({closeButton: true, closeOnClick: false, closeOnMove: false});
        let hasLeftAfterClosing = true;
        let currentHoveredSignCoords = undefined;
        let currentClickedSignCoords = undefined;
        let pitchBearingBeforeZoom = [0, 0];

        // Reset camera angle when exiting pop-up if camera hasn't been moved since zooming into the sign
        routePopup.on('close', (e) => {
            if (!currentHoveredSignCoords && !pitchBearingBeforeZoom.every(Boolean)) {
                map.easeTo({
                    bearing: 0,
                    pitch: 0,
                });
            }
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
        map.on('mousemove', 'pbot-bikesigns-layer', (e) => {
            map.getCanvas().style.cursor = 'pointer';

            const featureCoordinates = e.features[0].geometry.coordinates.toString();
            if (hasLeftAfterClosing && currentHoveredSignCoords !== featureCoordinates) {
                currentHoveredSignCoords = featureCoordinates;
                if (currentClickedSignCoords !== featureCoordinates) {
                    currentClickedSignCoords = undefined;
                }

                const coordinates = e.features[0].geometry.coordinates.slice();
                const signCode = e.features[0].properties.SignCode;
                const img = new Image();
                img.src = `https://pbotapps.blob.core.windows.net/sign-library/${signCode}%40128.png`;
                routePopup.setLngLat(coordinates).setDOMContent(img).addTo(map);
            }
        });

        // If a route sign is hovered only, close when mouse leaves (hover ends)
        // If the sign was clicked on, leave it open, but track it's no longer hovered
        map.on('mouseleave', 'pbot-bikesigns-layer', (e) => {
            if (!currentClickedSignCoords) {
                routePopup.remove();
            }
            map.getCanvas().style.cursor = '';
            hasLeftAfterClosing = true;
            currentHoveredSignCoords = undefined;
        });

        // If a route sign is clocked on, leave it open, and zoom in to its position
        // If clicked again, close the pop-up
        map.on('click', 'pbot-bikesigns-layer', (e) => {
            const clickedFeature = e.features[0];
            const clickedFeatureCoordinates = clickedFeature.geometry.coordinates.toString();
            if (currentClickedSignCoords === clickedFeatureCoordinates) {
                // close it
                console.log('closing pop-up');
                currentClickedSignCoords = undefined;
                currentHoveredSignCoords = undefined;
                routePopup.remove();
                hasLeftAfterClosing = false;
                curPitchBearing = [map.getPitch(), map.getBearing()];

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
        });


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
        const rtLegend = await routesService.generateLegend();
        const rtLegendLayers = [4];
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
        

        // Legend config is built manually to control labels and styling for clarity
        // If "showCheckbox" is enabled or "visible" is disabled, "id" must match a layer,
        // and will be used to toggle the layer visibility
        // Layer title is required and is always shown. Layer may optionally contain icons.
        // Checkbox is only shown at the layer level, and toggles everything on/off for that layer. 
        // Icons can be an img or svg, if svg styling can be applied. 
        const layerConfig = [
            {
                id: 'traffic-signals-pseudo-layer',
                title: 'Signs & Signals',
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
                id: pdxReporterLayer,
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
            }
        ];

        const legend = document.querySelector('.sidebar .legend_main_layers');
        generateLegend(map, legend, layerConfig);

        // Fetching and applying the dynamic layers takes a moment, so we do this last
        const markingsDynamicLayers = await fetch('data/pbot-assets-dynamic-layers.json').then(r => r.json());
        markingsService.setDynamicLayers(markingsDynamicLayers);
    });
});


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
            map.setLayoutProperty(layer.id, 'visibility', layer.visible ? 'visible' : 'none');
            layerCheckbox.addEventListener('change', (e) => {
                // console.log('checkbox changed', e.target.checked, e);
                const checked = e.target.checked;
                // console.log(`toggling layer "${layer.id}" to ${checked}`);
                map.setLayoutProperty(layer.id, 'visibility', checked ? 'visible' : 'none');
                if (!checked) {
                    iconsList.classList.add(hideClass);
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

// app.js

// Grant CesiumJS access to your ion assets
// --- IMPORTANT: Using your actual token ---
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxODFlMzg1MS0yNjNiLTQ2NjQtYjdlNC1jN2RiZjhjMGZiOWQiLCJpZCI6MjkzOTkzLCJpYXQiOjE3NDQ2Mzc2MTF9.hO0qmOtSNBv-buxwOBkgZ6XKPyNk_TQdhhYnohE_Y-A";

// --- Global variables ---
let viewer;
let legendTitleElement; // Variable to hold the legend title DOM element
let doInitialStaging = true;
let addSuitabilityLayers = true;
let addPowerPlantLayers = true;
let addTransmissionLines = true;
let addModels = true;

// --- UI Elements (Grabbed once) ---
const legendDiv = document.getElementById('legendDiv');
const pitchSlider = document.getElementById("pitchSlider");
const headingSlider = document.getElementById("headingSlider");
const pitchValue = document.getElementById("pitchValue");
const headingValue = document.getElementById("headingValue");
const heightValue = document.getElementById("heightValue");
const flyToButton = document.getElementById("flyToButton");
const sequenceButton = document.getElementById("sequenceButton");

// --- Legend Management ---
const legendItems = {}; // Keep track of legend items by id


// Register the material with Cesium's Material cache
const animatedFlowingMaterial = new Cesium.Material({
    fabric: {
        type: Cesium.Material.FlowingDashMaterialType,
        uniforms: {
            baseColor: new Cesium.Color(0.0, 0.5, 0.8, 0.5), // Semi-transparent blue (base)
            flowColor: new Cesium.Color(1.0, 1.0, 1.0, 1.0),   // White for the dash
            speed: 2.0,        // Speed of animation (adjust as needed)
            dashLength: 0.15,  // Relative length of the dash
            repeat: 240.0,       // Number of dash cycles along the line
            time: new Cesium.CallbackProperty(() => {
                return performance.now() / 1000.0;
            }, false)
        },
        source: `
            czm_material czm_getMaterial(czm_materialInput materialInput)
            {
                czm_material material = czm_getDefaultMaterial(materialInput);
                float s = materialInput.s;
                float t = uniforms.time;
                // Compute the repeating pattern that shifts over time.
                float patternPosition = fract(s * uniforms.repeat - t * uniforms.speed);
                vec4 base = uniforms.baseColor;
                vec4 flow = uniforms.flowColor;
                float dash = uniforms.dashLength;
                float stepWidth = 0.01;
                // Create smooth edges for the dash.
                float mixFactor = smoothstep(0.0, stepWidth, patternPosition) - 
                                  smoothstep(dash - stepWidth, dash, patternPosition);
                vec4 finalColor = mix(base, flow, mixFactor);
                material.diffuse = finalColor.rgb;
                material.alpha = finalColor.a;
                return material;
            }
        `
    },
    translucent: true
});

function addLegendItem(id, title, symbolHtml, clearLegendItems = false) {
    if (!legendItems[id]) {

        // clear legend items if requested
        if (clearLegendItems) {
            const allLegendIds = Object.keys(legendItems);
            allLegendIds.forEach(id => removeLegendItem(id));
        }

        const item = document.createElement('div');
        item.id = `legend-item-${id.replace(/[^a-zA-Z0-9]/g, '-')}`; // Sanitize ID for DOM

        // Ensure symbolHtml is treated as HTML, and title is treated as text
        item.innerHTML = `${symbolHtml} <span></span>`;
        item.querySelector('span').textContent = title; // Safer way to set text
        legendDiv.appendChild(item);
        legendItems[id] = item;
    } else {
        // Optional: Update existing item if needed?
        // console.log(`Legend item ${id} already exists.`);
    }
}

function removeLegendItem(id) {
    const domId = `legend-item-${id.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const itemElement = document.getElementById(domId);
    if (itemElement) {
        try {
            legendDiv.removeChild(itemElement);
        } catch (e) { console.warn("Error removing legend item from DOM:", e); }
        delete legendItems[id]; // Remove from tracking object
    }
}

// Helper function to clear specific legend items
function clearSpecificLegendItems(idsToRemove) {
    console.log("Clearing specific legend items:", idsToRemove);
    idsToRemove.forEach(id => {
        removeLegendItem(id);
    });
}

// Optional: Function to clear ALL sequence graphics AND legend items
function clearSequenceGraphics(viewerInstance) {

    if (!viewerInstance) return;
    console.log("Clearing sequence graphics and ALL legend items...");

    // Clear all legend items currently tracked
    const allLegendIds = Object.keys(legendItems);

    // Remove DataSources (update with ALL relevant IDs used in your sequence)
    const layerIds = [
        // Suitability Layers
        'flood_risk_clipped', 
        'slope_clipped', 
        'airports_clipped',
        'cooling_water_clipped', 
        'protected_areas_clipped',
        // Power Plant Layers (Add all years used)
        '2030_gas_plants_clipped',
        '2035_gas_plants_clipped',
        '2040_gas_plants_clipped',
        '2045_gas_plants_clipped',
        '2050_gas_plants_clipped'
        // Add any other layer IDs that might be loaded in the sequence
    ];

    layerIds.forEach(id => {
        const dsCollection = viewerInstance.dataSources.getByName(id);
        if (dsCollection.length > 0) {
             dsCollection.forEach(ds => viewerInstance.dataSources.remove(ds, true)); // Remove all with that name
             console.log(`Removed DataSource(s) with name: ${id}`);
        } else {
            // console.log(`No DataSource found with name: ${id}`); // Optional log
        }
    });
}

const flowingMaterial = new Cesium.Material({
    fabric: {
        type: Cesium.Material.FlowingDashMaterialType
    }
});

// --- Core CesiumJS Initialization (Async Function) ---
async function startCesium() {
    try {
        // console.log("Initializing Cesium Viewer...");

        viewer = new Cesium.Viewer('cesiumContainer', {
            // Use Cesium World Terrain via Ion Asset ID (Asset 1) - ENABLED
            terrainProvider: await Cesium.CesiumTerrainProvider.fromIonAssetId(1),

            // Use high-res satellite imagery from Esri by default
            imageryProvider: new Cesium.ArcGisMapServerImageryProvider({
                url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
            }),
            animation: false,
            fullscreenButton: false, // Keep false or true based on preference
            geocoder: false, // Keep false or true based on preference
            homeButton: false, // Keep false or true based on preference
            infoBox: true, // Usually useful, keep true unless specifically not needed
            sceneModePicker: false, // Usually false for focused apps
            selectionIndicator: true, // Usually useful, keep true
            timeline: false, // Keep false unless time-dynamic data is used
            navigationHelpButton: false, // Keep false or true based on preference
        });

        // console.log("Cesium Viewer initialized successfully.");
        // Add this code after your Cesium initialization, e.g., at the end of your app.js file.
        viewer.scene.preRender.addEventListener(() => {
            if (!viewer || !viewer.camera || !viewer.camera.positionCartographic) return;
            
            const camera = viewer.camera;
            const position = camera.positionCartographic;
            
            // Update Pitch and Heading from their current values
            const currentPitch = Cesium.Math.toDegrees(camera.pitch);
            const currentHeading = Cesium.Math.toDegrees(camera.heading);
            const normalizedHeading = (currentHeading % 360 + 360) % 360;
            
            // Update the UI elements directly
            document.getElementById("pitchValue").textContent = Math.round(currentPitch);
            document.getElementById("headingValue").textContent = Math.round(normalizedHeading);
            
            // Update the Height display (meters)
            const currentHeight = Math.round(position.height);
            document.getElementById("heightValue").textContent = currentHeight;
            
            // Update the center coordinates of the view
            const canvas = viewer.scene.canvas;
            const centerScreen = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
            const centerCartesian = viewer.scene.camera.pickEllipsoid(centerScreen, Cesium.Ellipsoid.WGS84);
            
            if (centerCartesian) {
                const centerCarto = Cesium.Cartographic.fromCartesian(centerCartesian);
                const centerLatDegrees = Cesium.Math.toDegrees(centerCarto.latitude).toFixed(6);
                const centerLonDegrees = Cesium.Math.toDegrees(centerCarto.longitude).toFixed(6);
                
                document.getElementById("centerLat").textContent = centerLatDegrees;
                document.getElementById("centerLon").textContent = centerLonDegrees;
            }

            // Update our flowing material time uniform based on performance.now()
            // (Divide by 1000 to convert milliseconds to seconds)
            flowingMaterial.uniforms.time = performance.now() / 1000.0;
        });

        // --- Get Legend Title Element Reference ---
        legendTitleElement = document.getElementById('legendTitle');
        if (!legendTitleElement) {
            console.error("Legend title element with ID 'legendTitle' not found! Check index.html.");
        }

        // --- Attach Event Listeners and UI Logic that depends on 'viewer' ---
        // Legend Listeners
        viewer.dataSources.dataSourceAdded.addEventListener((collection, dataSource) => {
            console.log(`DataSource added: ${dataSource.name}`);
            // Ensure legendInfo exists before trying to add
            if (dataSource.legendInfo && legendTitleElement) { // Check legendTitleElement too
                addLegendItem(dataSource.name, dataSource.legendInfo.title, dataSource.legendInfo.symbolHtml);
            } else if (dataSource.name && !dataSource.legendInfo) {
                console.warn(`DataSource ${dataSource.name} added without legendInfo.`);
            }
        });
        viewer.dataSources.dataSourceRemoved.addEventListener((collection, dataSource) => {
            console.log(`DataSource removed: ${dataSource.name}`);
            // Use name property if it exists to remove legend item
            if (dataSource.name) {
                removeLegendItem(dataSource.name);
            }
        });

        // Camera Control Logic
        function updateCameraFromSliders() {
            if (!viewer || !viewer.camera.positionCartographic) {
              console.warn("Viewer or camera position not ready for slider update.");
              return;
            }
            
            const heading = Cesium.Math.toRadians(parseFloat(headingSlider.value));
            const pitch = Cesium.Math.toRadians(parseFloat(pitchSlider.value));
            
            // Instead of reading from a removed height slider, obtain the current height from the camera.
            const currentHeight = viewer.camera.positionCartographic.height;
            const center = viewer.camera.positionCartographic;
          
            viewer.camera.setView({
              destination: Cesium.Cartesian3.fromRadians(center.longitude, center.latitude, currentHeight),
              orientation: { heading: heading, pitch: pitch, roll: 0.0 }
            });
          }

        pitchSlider.addEventListener("input", () => { pitchValue.textContent = pitchSlider.value; updateCameraFromSliders(); });
        headingSlider.addEventListener("input", () => { headingValue.textContent = headingSlider.value; updateCameraFromSliders(); });

        // Update sliders on manual navigation
        viewer.camera.changed.addEventListener(() => {

            if (!viewer || !viewer.camera.positionCartographic) return; // Extra safety check

            const camera = viewer.camera;
            const position = camera.positionCartographic;

            const currentPitch = Cesium.Math.toDegrees(camera.pitch);
            const currentHeading = Cesium.Math.toDegrees(camera.heading);
            const normalizedHeading = (currentHeading % 360 + 360) % 360;
            
            if (Math.abs(parseFloat(pitchSlider.value) - Math.round(currentPitch)) > 0.5) {
                pitchSlider.value = Math.round(currentPitch);
                pitchValue.textContent = Math.round(currentPitch);
            }
            if (Math.abs(parseFloat(headingSlider.value) - Math.round(normalizedHeading)) > 0.5) {
                headingSlider.value = Math.round(normalizedHeading);
                headingValue.textContent = Math.round(normalizedHeading);
            }

            // Update the Height display in meters (no slider)
            const currentHeight = Math.round(position.height); // height is in meters
            document.getElementById("heightValue").textContent = currentHeight;
            
            // --- Update the Center Coordinates ---
            const canvas = viewer.scene.canvas;
            const centerScreen = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
            const centerCartesian = viewer.scene.camera.pickEllipsoid(centerScreen, Cesium.Ellipsoid.WGS84);
            
            if (centerCartesian) {
                const centerCarto = Cesium.Cartographic.fromCartesian(centerCartesian);
                const centerLatDegrees = Cesium.Math.toDegrees(centerCarto.latitude).toFixed(4);
                const centerLonDegrees = Cesium.Math.toDegrees(centerCarto.longitude).toFixed(4);
                
                // Update the HTML elements with the new coordinates
                document.getElementById("centerLat").textContent = centerLatDegrees;
                document.getElementById("centerLon").textContent = centerLonDegrees;
            }
        });


        // ROI coordinates
        const roiLon = -109.908214;
        const roiLat = 41.469939;
        const roiHeight = 120000; // in meters

        // Sequence Button Listener
        sequenceButton.addEventListener("click", async () => {
            console.log("Run Sequence button clicked.");

            try {
                if (doInitialStaging) {
                    await flyToLocation(viewer, roiLon, roiLat, roiHeight); // Wait for flight
                }

                // Clear sequence graphics if needed
                clearSequenceGraphics(viewer);

                // Run the sequence to add suitability layers and further content
                await runSequence(viewer, roiLon, roiLat);
        
            } catch (error) {
                 console.error("Error during initial fly-to:", error);
            }
        });

    } catch (error) {
        console.error("Failed to initialize Cesium Viewer:", error);
        const container = document.getElementById('cesiumContainer');
        if (container) {
            container.innerHTML = `<div style="padding: 20px; color: red; text-align: center;">Error initializing map: ${error.message} <br/> Please check the console (F12) and ensure your Cesium Ion Token is correct.</div>`;
        }
    }
}

// Fly-to Implementation
function flyToLocation(
    viewerInstance, 
    lon, 
    lat, 
    height = 1000, 
    heading = 0, 
    pitch = -90, 
    duration = 5
) {
    return new Promise((resolve, reject) => {
      try {
        viewerInstance.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
          orientation: {
            heading: Cesium.Math.toRadians(heading),
            pitch: Cesium.Math.toRadians(pitch),
            roll: 0.0
          },
          duration: duration,
          complete: resolve,
          cancel: () => {
            console.warn("flyTo canceled");
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

function fadeInModel(modelEntity, duration) {
    const startTime = performance.now();

    function update() {
        const now = performance.now();
        const elapsed = now - startTime;
        const alpha = Math.min(elapsed / duration, 1.0);
        
        // Update the model's tint (if supported by your model)
        modelEntity.model.color = Cesium.Color.WHITE.withAlpha(alpha);
        
        if (alpha < 1.0) {
            requestAnimationFrame(update);
        } else {
            console.log("Model fade-in complete");
        }
    }

    requestAnimationFrame(update);
}

// Sequential Layer Addition Helper
async function addLayerSequentially(viewerInstance, layerPromiseFactory, id, title, symbolHtml, delayMs = 2000, wait = true) {

    if (!viewerInstance) return null;

    // Add legend item
    if (legendTitleElement) {
        addLegendItem(id, title, symbolHtml);
    } else {
        console.warn("Cannot add legend item, legendTitleElement not found.");
    }

    let layerData = null;

    try {
        layerData = await layerPromiseFactory();
        if (!layerData) { throw new Error("Layer promise factory resolved with no data."); }

        // Ensure layerData has a name property for later lookup/removal
        layerData.name = id;

        // Attach legend info for potential use by dataSourceAdded listener (if needed elsewhere)
        layerData.legendInfo = { title, symbolHtml };

        // Add based on type - Assuming DataSource based on user code working
        await viewerInstance.dataSources.add(layerData);

        // console.log(`Layer "${title}" [${id}] loaded and added.`);
        const legendElement = document.getElementById(`legend-item-${id.replace(/[^a-zA-Z0-9]/g, '-')}`);
        if (legendElement) legendElement.style.opacity = '1';

        return layerData; // Return the actual DataSource/Layer object

    } catch (error) {
        console.error(`Failed to load/add layer ${title} [${id}]:`, error);
        removeLegendItem(id); // Attempt removal on error
        return null; // Return null on error

    } finally {
        // Apply delay only if layer loaded successfully and delay is positive
        if (layerData && delayMs > 0 && wait) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

// --- Main Animation Sequence ---
async function runSequence(viewerInstance, baseLon, baseLat) {
    // NOTE: This sequence targets the user-confirmed ROI: Lon ~-109.9, Lat ~41.5 (WY/UT/CO area)
    if (!viewerInstance || !legendTitleElement) {
        console.error("Viewer instance or Legend Title Element not available for runSequence.");
        return;
    }
    // console.log("Starting sequence...");


    // --------------------------------------------------------------------------------
    // 1. ADD SUITABILITY LAYERS
    // --------------------------------------------------------------------------------

    const suitabilityLayerIds = [ // Keep track of IDs to remove later
        'flood_risk_clipped',
        'slope_clipped',
        'airports_clipped',
        'cooling_water_clipped',
        'protected_areas_clipped'
    ];

    if (addSuitabilityLayers) {

        legendTitleElement.textContent = "Unsuitable Gas Plant Areas"; // Set initial title

        const polygonOptions = {
            stroke: Cesium.Color.BLACK,
            fill: Cesium.Color.BLACK.withAlpha(1.0),
            strokeWidth: 3,
            clampToGround: true,
            height: 0,
        };
        
        // --- Load Suitability Layers ---
        // Using sequential awaits as provided by user, not Promise.allSettled
        console.log("Loading suitability layers...");
        const floodRisk = await addLayerSequentially(viewerInstance, () => Cesium.GeoJsonDataSource.load('./data/geojson/flood_risk_clipped.geojson', polygonOptions), 'flood_risk_clipped', 'Flood Risk', '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>');
        const slopeExceedance = await addLayerSequentially(viewerInstance, () => Cesium.GeoJsonDataSource.load('./data/geojson/slope_clipped.geojson', polygonOptions), 'slope_clipped', 'Slope Exceedance', '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>');
        const airportVicinity = await addLayerSequentially(viewerInstance, () => Cesium.GeoJsonDataSource.load('./data/geojson/airports_clipped.geojson', polygonOptions), 'airports_clipped', 'Airport Vicinity', '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>');
        const coolingWater = await addLayerSequentially(viewerInstance, () => Cesium.GeoJsonDataSource.load('./data/geojson/cooling_water_clipped.geojson', polygonOptions), 'cooling_water_clipped', 'Available Water', '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>');
        const protectedAreas = await addLayerSequentially(viewerInstance, () => Cesium.GeoJsonDataSource.load('./data/geojson/protected_areas_clipped.geojson', polygonOptions), 'protected_areas_clipped', 'Protected Area', '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>');
    } 
    
    // --------------------------------------------------------------------------------
    // 2. ADD TRANSMISSION LINES LAYER
    // --------------------------------------------------------------------------------
    if (addTransmissionLines){

        console.log("Loading transmission lines layer...");
        const lineOptions = {
            stroke: Cesium.Color.ORANGE, // Choose a visible color
            strokeWidth: 3,           // Choose a width
            clampToGround: true       // Clamp lines to terrain
        };
        const transmissionLines = await addLayerSequentially(
            viewerInstance,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/transmission_clipped.geojson', lineOptions),
            'transmission_clipped',
            'Transmission Lines',
            '<div class="legend-symbol" style="border-top: 2px solid orange; width: 15px; height: 0; display: inline-block;"></div>' // Example line symbol
        );
        // Optional: Add post-load loop here if specific line properties need setting
        if(transmissionLines){
            console.log("Transmission lines loaded.");
            // You could potentially iterate and set polyline properties if needed:
            // transmissionLines.entities.values.forEach(function(entity) {
            //     if(entity.polyline){ entity.polyline.arcType = Cesium.ArcType.GEODESIC; }
            // });
        } else {
            console.log("Transmission lines layer failed to load.");
        }
        await new Promise(resolve => setTimeout(resolve, 0)); // Pause after loading lines
    }

    // --------------------------------------------------------------------------------
    // 3. ADD POWER PLANT LAYERS
    // --------------------------------------------------------------------------------
    if (addPowerPlantLayers) {
        const removeLayers = [...suitabilityLayerIds]; //, "transmission_clipped"];

        // console.log("Transitioning to Power Plant phase...");
        legendTitleElement.textContent = "Sited Gas Plants"; // Change legend title
        clearSpecificLegendItems(removeLayers); // Clear old legend items
        await new Promise(resolve => setTimeout(resolve, 500)); // Short pause after clearing legend

        // --- Load Power Plant Layers (Loop through years) ---
        // console.log("Loading power plant layers...");
        const powerPlantYears = [2030, 2035, 2040, 2045, 2050];
        const iconBase = './data/markers/round_gas_icon.png'; // Store base path

        for (const year of powerPlantYears) {
            const filename = `./data/geojson/${year}_gas_plants_clipped.geojson`;
            const layerId = `${year}_gas_plants_clipped`;
            const legendTitle = `${year}`; // Legend entry is just the year
            const legendSymbol = `<img src="${iconBase}" class="legend-symbol-img" alt="${year} Gas Plant">`; // Use icon in legend

            // Add legend item BEFORE attempting load
            addLegendItem(layerId, legendTitle, legendSymbol, true);

            // Format legend text:  find the element we just added by its constructed ID
            const legendDomId = `legend-item-${layerId.replace(/[^a-zA-Z0-9]/g, '-')}`;
            const legendElement = document.getElementById(legendDomId);
            if (legendElement) {
                legendElement.classList.add('power-plant-legend-item'); // Add the CSS class
                console.log(`Added class 'power-plant-legend-item' to ${layerId}`);
            }

            // console.log(`Attempting to load layer: ${layerId}`);
            // Call helper without pointOptions (user version still included it definitionally, but not in call)
            const pptDataSource = await addLayerSequentially(
                viewerInstance,
                () => Cesium.GeoJsonDataSource.load(filename, { clampToGround: true }), 
                layerId,
                legendTitle,
                legendSymbol,
                2000, // 2-second delay
                false // remove delay as it will cause the icon to appear after the default icon shows up
            );

            // Visibility and Styling Logic
            if (pptDataSource) {
                // console.log(`Successfully loaded ${layerId}. Applying styles...`);

                // Ensure current data source is visible
                pptDataSource.show = true;

                // Apply styling to billboards
                pptDataSource.entities.values.forEach(function(entity) {
                    if (Cesium.defined(entity.billboard)) { // Check if it's a billboard
                        entity.billboard.image = iconBase;
                        entity.billboard.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
                        entity.billboard.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
                        entity.billboard.scale = 0.02; // Using very small scale from user code
                        // entity.billboard.pixelOffset = new Cesium.Cartesian2(0, 6); // User had this commented out

                    } else if (Cesium.defined(entity.point)) { // Fallback check
                        console.warn(`Power plant entity loaded as PointGraphic: ${entity.id || year}`);
                        entity.point.pixelSize = 8;
                        entity.point.color = Cesium.Color.ORANGE;
                        entity.point.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
                    } else {
                        console.warn(`Entity in ${year} layer is not a billboard or point: ${entity.id || year}`);
                    }
                });
                // console.log(`Finished applying styles to ${year} entities.`);

                // Once all entities have been restyled with the custom icon, show the layer.
                pptDataSource.show = true;

                // add delay in here to let the icon show
                await new Promise(resolve => setTimeout(resolve, 2500));


            } else {
                // FAILURE: Current year FAILED to load
                console.log(`Layer ${layerId} failed to load (likely missing file). Previous layer remains visible.`);
                // Legend item remains visible. Previous layer remains visible.
                // Do NOT update previousPptDataSource
                removeLegendItem(layerId); // Remove legend item if load failed
            }
            // Delay is handled in addLayerSequentially's finally block
        } // End of year loop
    }

    // --------------------------------------------------------------------------------
    // 4. ADD 3D MODEL
    // --------------------------------------------------------------------------------

    if (addModels) {
        // Clear layers
        clearSequenceGraphics(viewerInstance); // Call the clearing function
        await new Promise(resolve => setTimeout(resolve, 500)); // Optional short pause after clearing

        // Set new legend title for the model phase
        if (legendTitleElement) {
            legendTitleElement.textContent = "Build Power Plant"; // Or leave blank: ""
        }

        // --- === ADD 3D GLB MODEL === ---
        // console.log("Adding 3D power plant model...");
        const modelLon = -110.55166;
        const modelLat = 41.31584;
        const modelHeight = 2316; // meters
        const modelPitch = -22.0;
        const modelHeading = 199.0;
        const modelPath = './data/models/gas_plant_v3.glb'; // Ensure this path is correct
        const modelEntityId = 'powerPlantModel-main';

        const modelLonOffset = 0.0015
        const modelLatOffset = 0.0035

        // Define position (Lon, Lat, Height=0 - will be adjusted by heightReference)
        const modelPosition = Cesium.Cartesian3.fromDegrees(modelLon, modelLat);

        // Remove any previous model entity
        viewer.entities.removeById(modelEntityId);

        // Add the new model entity with an initial transparent tint:
        const modelEntity0 = viewer.entities.add({
            id: 'powerPlantModel-main_0',
            name: 'Gas Power Plant Model',
            position: modelPosition,
            model: {
                uri: './data/models/gas_plant_build0.glb',
                scale: 2.0, // Adjust as needed
                minimumPixelSize: 64,
                maximumScale: 20000,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                // Set initial tint to fully transparent
                color: Cesium.Color.WHITE.withAlpha(0)
            }
        });

        const modelEntity1 = viewer.entities.add({
            id: 'powerPlantModel-main_1',
            name: 'Gas Power Plant Model',
            position: modelPosition,
            model: {
                uri: './data/models/gas_plant_build1.glb',
                scale: 2.0, // Adjust as needed
                minimumPixelSize: 64,
                maximumScale: 20000,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                // Set initial tint to fully transparent
                color: Cesium.Color.WHITE.withAlpha(0)
            }
        });

        const modelEntity2 = viewer.entities.add({
            id: 'powerPlantModel-main_2',
            name: 'Gas Power Plant Model',
            position: modelPosition,
            model: {
                uri: './data/models/gas_plant_build2.glb',
                scale: 2.0, // Adjust as needed
                minimumPixelSize: 64,
                maximumScale: 20000,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                // Set initial tint to fully transparent
                color: Cesium.Color.WHITE.withAlpha(0)
            }
        });

        const modelEntity3 = viewer.entities.add({
            id: 'powerPlantModel-main_3',
            name: 'Gas Power Plant Model',
            position: modelPosition,
            model: {
                uri: './data/models/gas_plant_build3.glb',
                scale: 2.0, // Adjust as needed
                minimumPixelSize: 64,
                maximumScale: 20000,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                // Set initial tint to fully transparent
                color: Cesium.Color.WHITE.withAlpha(0)
            }
        });

        const modelEntity4 = viewer.entities.add({
            id: 'powerPlantModel-main_4',
            name: 'Gas Power Plant Model',
            position: modelPosition,
            model: {
                uri: './data/models/gas_plant_build4.glb',
                scale: 2.0, // Adjust as needed
                minimumPixelSize: 64,
                maximumScale: 20000,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                // Set initial tint to fully transparent
                color: Cesium.Color.WHITE.withAlpha(0)
            }
        });

        // Add the new model entity with an initial transparent tint:
        const modelEntity5 = viewer.entities.add({
            id: 'powerPlantModel-main_5',
            name: 'Gas Power Plant Model',
            position: modelPosition,
            model: {
                uri: './data/models/gas_plant_v3.glb',
                scale: 2.0, // Adjust as needed
                minimumPixelSize: 64,
                maximumScale: 20000,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                // Set initial tint to fully transparent
                color: Cesium.Color.WHITE.withAlpha(0)
            }
        });

        // Use the flyToLocation wrapper
        try {
            await flyToLocation(
                viewerInstance, 
                modelLon + modelLonOffset, 
                modelLat + modelLatOffset,
                modelHeight, 
                modelHeading, 
                modelPitch, 
                5.0
            );
            // Once fly-to completes, fade in the model gradually
            fadeInModel(modelEntity0, 1510000);
            await new Promise(resolve => setTimeout(resolve, 2500));
            
            fadeInModel(modelEntity1, 100);
            await new Promise(resolve => setTimeout(resolve, 2500));

            fadeInModel(modelEntity2, 100);
            await new Promise(resolve => setTimeout(resolve, 2500));

            fadeInModel(modelEntity3, 100);
            await new Promise(resolve => setTimeout(resolve, 2500));

            fadeInModel(modelEntity4, 100);
            await new Promise(resolve => setTimeout(resolve, 2500));

            fadeInModel(modelEntity5, 1500);

        } catch (error) {
            console.error("Error during fly-to:", error);
        }
    }
    // --------------------------------------------------------------------------------
    // 5. ADD TRANSMISSION CONNECTOR LINE
    // --------------------------------------------------------------------------------
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Set new legend title for the model phase
    if (legendTitleElement) {
        legendTitleElement.textContent = "Connect to Grid"; // Or leave blank: ""
    }

    // Ensure you have access to your 'viewer' instance here
    if (typeof viewer !== 'undefined' && viewer) {

        // RIGHT of tower
        const fromLatDeg = 41.317205;
        const fromLonDeg = -110.553498; 
        const toLatDeg   = 41.305885;
        const toLonDeg   = -110.553589;
        const desiredHeightMeters = 2262.5; 

        await flyToLocation(
            viewerInstance, 
            -110.553675, 
            41.318206,
            2296, 
            156, 
            -23, 
            5.0
        );

        const connectionLineTopLeft = viewer.entities.add({
            name: `Transmission Connector (Glowing, ${desiredHeightMeters}m high)`,
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                    -110.553352, 41.317205, desiredHeightMeters,
                    toLonDeg,   toLatDeg,   desiredHeightMeters
                ]),
                width: 4,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: new Cesium.CallbackProperty(function() {
                        // Get the current time in seconds
                        const time = performance.now() / 1000.0;
                        // Define the min and max glowPower values
                        const minGlow = 0.2;
                        const maxGlow = 1.0;
                        // Oscillate between minGlow and maxGlow using a sine wave.
                        // The sine value oscillates between -1 and 1, so transform it to 0-1.
                        let oscillation = (Math.sin(time * Math.PI * 2) + 1) / 2;
                        return minGlow + oscillation * (maxGlow - minGlow);
                    }, false),
                    color: Cesium.Color.RED.withAlpha(0.7)
                }),
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                clampToGround: false,
                arcType: Cesium.ArcType.GEODESIC
            }
        });

        const connectionLineMidLeft = viewer.entities.add({
            name: `Transmission Connector (Glowing, ${desiredHeightMeters}m high)`,
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                    -110.553335, 41.317204, desiredHeightMeters - 7.5,
                    toLonDeg,   toLatDeg,   desiredHeightMeters - 7.5
                ]),
                width: 4,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: new Cesium.CallbackProperty(function() {
                        // Get the current time in seconds
                        const time = performance.now() / 1000.0;
                        // Define the min and max glowPower values
                        const minGlow = 0.2;
                        const maxGlow = 1.0;
                        // Oscillate between minGlow and maxGlow using a sine wave.
                        // The sine value oscillates between -1 and 1, so transform it to 0-1.
                        let oscillation = (Math.sin(time * Math.PI * 2) + 1) / 2;
                        return minGlow + oscillation * (maxGlow - minGlow);
                    }, false),
                    color: Cesium.Color.RED.withAlpha(0.7)
                }),
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                clampToGround: false,
                arcType: Cesium.ArcType.GEODESIC
            }
        });

        const connectionLineBottomLeft = viewer.entities.add({
            name: `Transmission Connector (Glowing, ${desiredHeightMeters}m high)`,
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                    -110.5533506, 41.317204, desiredHeightMeters - 14.5,
                    toLonDeg,   toLatDeg,   desiredHeightMeters - 14.5
                ]),
                width: 4,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: new Cesium.CallbackProperty(function() {
                        // Get the current time in seconds
                        const time = performance.now() / 1000.0;
                        // Define the min and max glowPower values
                        const minGlow = 0.2;
                        const maxGlow = 1.0;
                        // Oscillate between minGlow and maxGlow using a sine wave.
                        // The sine value oscillates between -1 and 1, so transform it to 0-1.
                        let oscillation = (Math.sin(time * Math.PI * 2) + 1) / 2;
                        return minGlow + oscillation * (maxGlow - minGlow);
                    }, false),
                    color: Cesium.Color.RED.withAlpha(0.7)
                }),
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                clampToGround: false,
                arcType: Cesium.ArcType.GEODESIC
            }
        });

        const connectionLineTopRight = viewer.entities.add({
            name: `Transmission Connector (Glowing, ${desiredHeightMeters}m high)`,
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                    fromLonDeg, fromLatDeg, desiredHeightMeters,
                    toLonDeg,   toLatDeg,   desiredHeightMeters
                ]),
                width: 4,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: new Cesium.CallbackProperty(function() {
                        // Get the current time in seconds
                        const time = performance.now() / 1000.0;
                        // Define the min and max glowPower values
                        const minGlow = 0.2;
                        const maxGlow = 1.0;
                        // Oscillate between minGlow and maxGlow using a sine wave.
                        // The sine value oscillates between -1 and 1, so transform it to 0-1.
                        let oscillation = (Math.sin(time * Math.PI * 2) + 1) / 2;
                        return minGlow + oscillation * (maxGlow - minGlow);
                    }, false),
                    color: Cesium.Color.RED.withAlpha(0.7)
                }),
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                clampToGround: false,
                arcType: Cesium.ArcType.GEODESIC
            }
        });

        const connectionLineMidRight = viewer.entities.add({
            name: `Transmission Connector (Glowing, ${desiredHeightMeters}m high)`,
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                    -110.553518, 41.317205, desiredHeightMeters - 7.5,
                    toLonDeg,   toLatDeg,   desiredHeightMeters - 7.5
                ]),
                width: 4,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: new Cesium.CallbackProperty(function() {
                        // Get the current time in seconds
                        const time = performance.now() / 1000.0;
                        // Define the min and max glowPower values
                        const minGlow = 0.2;
                        const maxGlow = 1.0;
                        // Oscillate between minGlow and maxGlow using a sine wave.
                        // The sine value oscillates between -1 and 1, so transform it to 0-1.
                        let oscillation = (Math.sin(time * Math.PI * 2) + 1) / 2;
                        return minGlow + oscillation * (maxGlow - minGlow);
                    }, false),
                    color: Cesium.Color.RED.withAlpha(0.7)
                }),
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                clampToGround: false,
                arcType: Cesium.ArcType.GEODESIC
            }
        });

        const connectionLineBottomRight = viewer.entities.add({
            name: `Transmission Connector (Glowing, ${desiredHeightMeters}m high)`,
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                    -110.553496, 41.317205, desiredHeightMeters - 14.5,
                    toLonDeg,   toLatDeg,   desiredHeightMeters - 14.5
                ]),
                width: 4,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: new Cesium.CallbackProperty(function() {
                        // Get the current time in seconds
                        const time = performance.now() / 1000.0;
                        // Define the min and max glowPower values
                        const minGlow = 0.2;
                        const maxGlow = 1.0;
                        // Oscillate between minGlow and maxGlow using a sine wave.
                        // The sine value oscillates between -1 and 1, so transform it to 0-1.
                        let oscillation = (Math.sin(time * Math.PI * 2) + 1) / 2;
                        return minGlow + oscillation * (maxGlow - minGlow);
                    }, false),
                    color: Cesium.Color.RED.withAlpha(0.7)
                }),
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                clampToGround: false,
                arcType: Cesium.ArcType.GEODESIC
            }
        });

    } else {
        console.error("Cesium viewer instance is not available. Cannot add polyline.");
    }

}

// --- Start the Application ---
// Call the async function to initialize Cesium and set up the UI
startCesium();

// Add collapsible functionality for the "Camera Controls" section
document.addEventListener("DOMContentLoaded", () => {
    const controlsTitle = document.getElementById("controlsTitle");
    const cameraControlsContent = document.getElementById("cameraControlsContent");

    if (controlsTitle && cameraControlsContent) {
        // Ensure the header shows a pointer cursor
        controlsTitle.style.cursor = "pointer";

        controlsTitle.addEventListener("click", () => {
            cameraControlsContent.classList.toggle("collapsed");

            // Update header text to indicate the current state
            if (cameraControlsContent.classList.contains("collapsed")) {
                controlsTitle.textContent = "Camera Controls ▸";
            } else {
                controlsTitle.textContent = "Camera Controls ▾";
            }
        });
    }
});

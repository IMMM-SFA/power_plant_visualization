// app.js

// Import components
import { addAnimatedModel } from './components/addAnimatedModel.js';
import { addConnectorPolyline } from './components/addConnectorPolyline.js';


// Grant CesiumJS access to your ion assets
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxODFlMzg1MS0yNjNiLTQ2NjQtYjdlNC1jN2RiZjhjMGZiOWQiLCJpZCI6MjkzOTkzLCJpYXQiOjE3NDQ2Mzc2MTF9.hO0qmOtSNBv-buxwOBkgZ6XKPyNk_TQdhhYnohE_Y-A";

// --- Global variables ---
let viewer;
let legendTitleElement; // Variable to hold the legend title DOM element

// -----------------------------------
// Selectable options
// -----------------------------------
let addSuitabilityLayers = true;
let addGasPipelines = true;
let addTransmissionLines = true;
let addPowerPlantLayers = true;
let addBuffer = false;

// true = smooth camera fly; false = instant jump with fade
let useCameraFly = true;

// Time delay after a suitability layer is added
let suitabilityDelayMs = 100; // 2000

let pipelineWaitMs = 100; // 2500
let transmissionlineWaitMs = 100; // 2500

// Directly load on the ROI 
let goDirectlyToRoi = false;


// --- UI Elements (Grabbed once) ---
const legendDiv = document.getElementById('legendDiv');
const pitchSlider = document.getElementById("pitchSlider");
const headingSlider = document.getElementById("headingSlider");
const pitchValue = document.getElementById("pitchValue");
const headingValue = document.getElementById("headingValue");
const sequenceButton = document.getElementById("sequenceButton");

// Intro popup shown until Run Sequence clicked
const introPopup = document.createElement('div');
introPopup.id = 'introPopup';
introPopup.innerHTML = `
  <h1 style="margin:0; font-weight:bold; font-size:24px; color:white;">
    Projected locations of new natural gas combined cycle power plants (with recirculating cooling) in Wyoming, USA (2020-2050)
  </h1>
  </br>
  <p style="margin:8px 0 0; font-weight:400; font-size:18px; color:rgba(255,255,255,0.8);">
    This visualization uses results from CERF: Capacity Expansion Regional Feasibility model, https://immm-sfa.github.io/cerf/
  </p>
`;
introPopup.style.cssText = `
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(40, 40, 40, 0.8);
  border: 2px solid #333;
  border-radius: 12px;
  padding: 40px 60px;
  width: 350px;
  text-align: center;
  z-index: 1000;
`;

// Append popup inside the Cesium container so it centers over the map
const cesiumContainer = document.getElementById('cesiumContainer');
cesiumContainer.style.position = cesiumContainer.style.position || 'relative';
cesiumContainer.appendChild(introPopup);

// --- Legend Management ---
const legendItems = {}; // Keep track of legend items by id

// Options for suitability polygons
const polygonOptions = {
    stroke: Cesium.Color.BLACK,
    fill: Cesium.Color.BLACK.withAlpha(1.0),
    strokeWidth: 3,
    clampToGround: true,
    height: 0,
};

// Prepare a full‑screen black DIV for fades
const fadeDiv = document.createElement('div');
fadeDiv.style.cssText = `
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: black;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.6s ease-in-out;
  z-index: 999;
`;
document.body.appendChild(fadeDiv);

/**
 * Fade out, jump camera, then fade back in.
 * @returns {Promise}
 */
function fadeTransitionTo(viewerInstance, lon, lat, height, heading, pitch, durationMs = 1000) {
  return new Promise(resolve => {
    // 1. Prepare blur overlay fade‑in
    // ensure no black background
    fadeDiv.style.background = 'transparent';
    // animate both opacity and blur amount
    fadeDiv.style.transition = `opacity ${durationMs}ms ease-in-out, backdrop-filter ${durationMs}ms ease-in-out, -webkit-backdrop-filter ${durationMs}ms ease-in-out`;
    // set the blur radius you want (e.g., 8px)
    fadeDiv.style.backdropFilter = 'blur(8px)';
    fadeDiv.style.webkitBackdropFilter = 'blur(8px)';
    // fade overlay in (so it applies the blur)
    fadeDiv.style.opacity = 1;

    // wait for the blur‑in to finish
    setTimeout(() => {
      // 2. Jump camera instantly
      viewerInstance.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
        orientation: {
          heading: Cesium.Math.toRadians(heading),
          pitch: Cesium.Math.toRadians(pitch),
          roll: 0.0
        }
      });

      // 3. Fade overlay out (remove blur)
      fadeDiv.style.backdropFilter = 'blur(0px)';
      fadeDiv.style.webkitBackdropFilter = 'blur(0px)';
      fadeDiv.style.opacity = 0;

      // 4. Resolve after blur‑out transition is done
      setTimeout(resolve, durationMs);
    }, durationMs);
  });
}


/**
 * Adds an item to the legend.
 * @param {string} id - Unique ID for the legend item.
 * @param {string} title - Text label for the item.
 * @param {string} symbolHtml - HTML string for the symbol (e.g., colored div, img tag).
 * @param {boolean} [clearPreviousItems=false] - If true, clear existing items before adding this one (subject to exclusions).
 * @param {string[]} [excludeFromClearIds=[]] - An array of item IDs to *keep* if clearPreviousItems is true.
 */
function addLegendItem(id, title, symbolHtml, clearPreviousItems = false, excludeFromClearIds = []) { // Added exclude parameter

    // --- Clearing Logic ---
    if (clearPreviousItems) {
        const allCurrentIds = Object.keys(legendItems); // Get IDs currently in the legend
        allCurrentIds.forEach(existingId => {
            // Check if the current existing item's ID is in the exclusion list
            if (!excludeFromClearIds.includes(existingId)) {
                // If it's NOT excluded, remove it
                removeLegendItem(existingId);
            }
            // If it IS in the exclusion list, do nothing (keep it)
        });
    }
    // Only add if it doesn't already exist (or handle update logic if needed)
    if (!legendItems[id]) {
        const item = document.createElement('div');
        // Sanitize ID for DOM: replace non-alphanumeric chars with '-'
        const domId = `legend-item-${id.replace(/[^a-zA-Z0-9\-_]/g, '-')}`;
        item.id = domId;

        // Ensure symbolHtml is treated as HTML, and title is treated as text
        item.innerHTML = `${symbolHtml} <span></span>`;
        item.querySelector('span').textContent = title; // Safer way to set text

        legendDiv.appendChild(item);
        legendItems[id] = item; // Track the added item
    } else {
        // Optional: What to do if item with same ID already exists?
        // console.log(`Legend item ${id} already exists.`);
        // You could potentially update its title/symbol here if necessary.
    }
}

// removeLegendItem function remains the same...
function removeLegendItem(id) {
    // Sanitize ID to match how it was created
    const domId = `legend-item-${id.replace(/[^a-zA-Z0-9\-_]/g, '-')}`;
    const itemElement = document.getElementById(domId);
    if (itemElement) {
        try {
            // Check if parentNode exists before removing
            if (itemElement.parentNode === legendDiv) {
                 legendDiv.removeChild(itemElement);
            } else {
                 console.warn(`Attempted to remove legend item '${id}' but it was not a direct child of legendDiv.`);
            }
        } catch (e) {
            console.warn(`Error removing legend item '${id}' from DOM:`, e);
        }
        delete legendItems[id]; // Remove from tracking object regardless of DOM removal success/failure
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
        'id_suitability0', 
        'id_suitability1', 
        'id_suitability2', 
        'id_suitability3', 
        'id_suitability4', 
        'id_suitability5', 
        'id_suitability6', 
        'id_suitability7', 
        'id_suitability8', 
        'id_suitability9', 
        'id_suitability10', 
        'id_suitability11', 
        'id_suitability12', 
        'id_suitability13', 
        'id_suitability14', 

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

// Materials functions
const pulsatingGlowMaterial = new Cesium.PolylineGlowMaterialProperty({
    glowPower: new Cesium.CallbackProperty(function(time, result) {
        // Use performance.now() for continuous time base, independent of Cesium clock state
        const seconds = performance.now() / 1000.0;
        const minGlow = 0.2;
        const maxGlow = 1.0; // Max glow from your example
        // Adjust frequency (e.g., * Math.PI * 2 makes it cycle every 1 second)
        const oscillation = (Math.sin(seconds * Math.PI * 2) + 1) / 2; // Map sin (-1 to 1) -> (0 to 1)
        return minGlow + oscillation * (maxGlow - minGlow);
    }, false), // isConstant = false -> evaluate every frame
    taperPower: 1.0, // Consistent glow power along the line
    color: Cesium.Color.RED.withAlpha(0.7) // Color from your example
});

// Pulsating aqua glow for pipeline connector
const pulsatingGlowMaterialAqua = new Cesium.PolylineGlowMaterialProperty({
    glowPower: new Cesium.CallbackProperty(function(time, result) {
        const seconds = performance.now() / 2500.0;
        const minGlow = 0.4;
        const maxGlow = 0.8;
        const oscillation = (Math.sin(seconds * Math.PI * 2) + 1) / 2;
        return minGlow + oscillation * (maxGlow - minGlow);
    }, false),
    taperPower: 1.0,
    color: Cesium.Color.AQUA.withAlpha(0.7)
});

const pulsatingGlowMaterialBlue = new Cesium.PolylineGlowMaterialProperty({
    glowPower: new Cesium.CallbackProperty(function(time, result) {
        // Use performance.now() for continuous time base, independent of Cesium clock state
        const seconds = performance.now() / 2000.0;
        const minGlow = 0.2;
        const maxGlow = 1.0; // Max glow from your example
        // Adjust frequency (e.g., * Math.PI * 2 makes it cycle every 1 second)
        const oscillation = (Math.sin(seconds * Math.PI * 2) + 1) / 2; // Map sin (-1 to 1) -> (0 to 1)
        return minGlow + oscillation * (maxGlow - minGlow);
    }, false), // isConstant = false -> evaluate every frame
    taperPower: 1.0, // Consistent glow power along the line
    color: Cesium.Color.BLUE.withAlpha(0.7) // Color from your example
});

const pulsatingGlowMaterialSlow = new Cesium.PolylineGlowMaterialProperty({
    glowPower: new Cesium.CallbackProperty(function(time, result) {
        // Use performance.now() for continuous time base, independent of Cesium clock state
        const seconds = performance.now() / 2500.0;
        const minGlow = 0.2;
        const maxGlow = 0.6; // Max glow from your example
        // Adjust frequency (e.g., * Math.PI * 2 makes it cycle every 1 second)
        const oscillation = (Math.sin(seconds * Math.PI * 2) + 1) / 2; // Map sin (-1 to 1) -> (0 to 1)
        return minGlow + oscillation * (maxGlow - minGlow);
    }, false), // isConstant = false -> evaluate every frame
    taperPower: 1.0, // Consistent glow power along the line
    color: Cesium.Color.RED.withAlpha(0.7) // Color from your example
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
        // Hide the default Cesium credit/attribution bar
        viewer.cesiumWidget.creditContainer.style.display = 'none';

        // ---------------------------------------------
        //  SET INITIAL VIEW
        // ---------------------------------------------

        // Initial view on load
        viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(-99.0, 40.0, 4_000_000),
            orientation: {
              heading : Cesium.Math.toRadians(  0.0),
              pitch   : Cesium.Math.toRadians(-90.0),
              roll    : 0.15
            }
          });


        // ---------------------------------------------
        //  3D POWER PLANT MODEL
        // ---------------------------------------------

        // Define the configuration for the animated model sequence.
        const constructPowerPlant = {
            model: {
                lon: -110.55166,                     // Model longitude
                lat: 41.31584,                       // Model latitude
                uris: [                              // Array of model URIs (stages of construction)
                    './data/models/gas_plant_v3.glb'
                ],
                entityBaseId: 'powerPlantModel-main',  // Base ID for all model entities
                name: 'Gas Power Plant Model',         // Base display name
                scale: 2,                            // Model scale
                minimumPixelSize: 64,                  // Minimum pixel size
                maximumScale: 20000,                   // Maximum scale
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,  // Ensure the model is clamped to the terrain
                visible: false,         // Return the model completely transparent if false
            },
            camera: {
                flyTo: false,       // Enable camera flight to the model's location
            },
            animation: {
                delayForBuild: 0,  // controls the time lag for the model to be build before adding color - prevents flashing
                delayBetweenStages: 0   // Delay (ms) before starting the next model addition
            },
            legend: {
                update: false,              // Flag to update the legend title during this phase
            },
            cleanup: {
                removePrevious: false       // Remove previously added entities matching the entityBaseId before adding new ones
            }
        };

        // Call the modular function to add and animate the model(s)
        addAnimatedModel(viewer, constructPowerPlant);

        // ---------------------------------------------
        //  3D TRANSMISSION TOWERS
        // ---------------------------------------------

        // Define the configuration for the animated model sequence.
        const buildTransmissionTower = {
            model: {
                lon: -110.553592,                     // Model longitude
                lat: 41.305885,                       // Model latitude
                uris: [                              // Array of model URIs (stages of construction)
                    './data/models/transmission_tower.glb'
                ],
                entityBaseId: 'transmissionTower',  // Base ID for all model entities
                name: 'Transmission Tower',         // Base display name
                scale: 2,                            // Model scale
                minimumPixelSize: 64,                  // Minimum pixel size
                maximumScale: 20000,                   // Maximum scale
                rotation: 45,                           // Rotation of the model
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,  // Ensure the model is clamped to the terrain
                visible: false,         // Return the model completely transparent if false
            },
            camera: {
                flyTo: false,       // Enable camera flight to the model's location
            },
            animation: {
                delayForBuild: 0,  // controls the time lag for the model to be build before adding color - prevents flashing
                delayBetweenStages: 0   // Delay (ms) before starting the next model addition
            },
            legend: {
                update: false,              // Flag to update the legend title during this phase
            },
            cleanup: {
                removePrevious: false       // Remove previously added entities matching the entityBaseId before adding new ones
            }
        };

        addAnimatedModel(viewer, buildTransmissionTower);


        // Define the configuration for the animated model sequence.
        const buildTransmissionTowerTwo = {
            model: {
                lon: -110.545374,                     // Model longitude
                lat: 41.309198,                       // Model latitude
                uris: [                              // Array of model URIs (stages of construction)
                    './data/models/transmission_tower.glb'
                ],
                entityBaseId: 'transmissionTowerTwo',  // Base ID for all model entities
                name: 'Transmission Tower',         // Base display name
                scale: 2,                            // Model scale
                minimumPixelSize: 64,                  // Minimum pixel size
                maximumScale: 20000,                   // Maximum scale
                rotation: 45,                           // Rotation of the model
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,  // Ensure the model is clamped to the terrain
                visible: false,         // Return the model completely transparent if false
            },
            camera: {
                flyTo: false,       // Enable camera flight to the model's location
            },
            animation: {
                delayForBuild: 0,  // controls the time lag for the model to be build before adding color - prevents flashing
                delayBetweenStages: 0   // Delay (ms) before starting the next model addition
            },
            legend: {
                update: false,              // Flag to update the legend title during this phase
            },
            cleanup: {
                removePrevious: false       // Remove previously added entities matching the entityBaseId before adding new ones
            }
        };

        addAnimatedModel(viewer, buildTransmissionTowerTwo);


        // Define the configuration for the animated model sequence.
        const buildTransmissionTowerThree = {
            model: {
                lon: -110.525461,                     // Model longitude
                lat: 41.309241,                       // Model latitude
                uris: [                              // Array of model URIs (stages of construction)
                    './data/models/transmission_tower.glb'
                ],
                entityBaseId: 'transmissionTowerThree',  // Base ID for all model entities
                name: 'Transmission Tower',         // Base display name
                scale: 2.1,                            // Model scale
                minimumPixelSize: 64,                  // Minimum pixel size
                maximumScale: 20000,                   // Maximum scale
                rotation: 45,                           // Rotation of the model
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,  // Ensure the model is clamped to the terrain
                visible: false,         // Return the model completely transparent if false
            },
            camera: {
                flyTo: false,       // Enable camera flight to the model's location
            },
            animation: {
                delayForBuild: 0,  // controls the time lag for the model to be build before adding color - prevents flashing
                delayBetweenStages: 0   // Delay (ms) before starting the next model addition
            },
            legend: {
                update: false,              // Flag to update the legend title during this phase
            },
            cleanup: {
                removePrevious: false       // Remove previously added entities matching the entityBaseId before adding new ones
            }
        };

        addAnimatedModel(viewer, buildTransmissionTowerThree);

        // ---------------------------------------------
        //  SETUP LISTENER
        // ---------------------------------------------

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
        const roiLon = -110.7; // -110.2;  
        const roiLat = 41.469939;
        const roiHeight = 150055; // 132000; // in meters

        // Sequence Button Listener
sequenceButton.addEventListener("click", async () => {
    // Remove intro popup before starting sequence
    const intro = document.getElementById('introPopup');
    if (intro) {
        intro.parentNode.removeChild(intro);
    }
    console.log("Run Sequence button clicked.");
            try {
                // Clear sequence graphics if needed
                clearSequenceGraphics(viewer);

                // Run the sequence: show Wyoming first, then fly to ROI
                await runSequence(viewer, roiLon, roiLat, roiHeight);
            } catch (error) {
                console.error("Error during runSequence:", error);
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

/**
 * Animate a white rectangle randomly moving around your NLC grid
 * until it settles over the cell containing the current year’s plant.
 *
 * @param {Cesium.Viewer} viewerInstance
 * @param {Cesium.GeoJsonDataSource} nlcDs         – the loaded NLC layer for that year
 * @param {Cesium.DataSource} pptDs               – the loaded power‑plant GeoJSON for that year
 * @param {number} durationSeconds                – how long to random‑move before settling
 * @returns {Promise<void>}                       – resolves once the highlight is in place
 */
function animateRandomHighlight(viewerInstance, nlcDs, pptDs, durationSeconds, maskRect) {
    // If a mask rectangle is provided, filter to only those NLC entities whose bounding rect intersects it
    let entitiesToUse = nlcDs.entities.values;
    if (maskRect) {
        entitiesToUse = entitiesToUse.filter(ent => {
            const coords = ent.polygon.hierarchy.getValue(Cesium.JulianDate.now()).positions;
            const cellRect = Cesium.Rectangle.fromCartesianArray(coords);
            return Cesium.Rectangle.intersection(cellRect, maskRect) !== undefined;
        });
    }
    return new Promise(resolve => {
        // 1. Sample one NLC cell to get its width/height
        const sample = entitiesToUse[0];
        const sampleCartesians = sample.polygon.hierarchy.getValue(Cesium.JulianDate.now()).positions;
        const sampleRect       = Cesium.Rectangle.fromCartesianArray(sampleCartesians);
        const cellW = sampleRect.east  - sampleRect.west;
        const cellH = sampleRect.north - sampleRect.south;

        // 2. Compute the full NLC extent
        let minW = Infinity, maxE = -Infinity, minS = Infinity, maxN = -Infinity;
        entitiesToUse.forEach(ent => {
            const coords = ent.polygon.hierarchy.getValue(Cesium.JulianDate.now()).positions;
            const r = Cesium.Rectangle.fromCartesianArray(coords);
            minW = Math.min(minW, r.west);
            maxE = Math.max(maxE, r.east);
            minS = Math.min(minS, r.south);
            maxN = Math.max(maxN, r.north);
        });

        // 3. Find which NLC cell contains the plant
        const plantPos   = pptDs.entities.values[0].position.getValue(Cesium.JulianDate.now());
        const plantCarto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(plantPos);
        let targetRect = sampleRect;
        entitiesToUse.some(ent => {
            const coords = ent.polygon.hierarchy.getValue(Cesium.JulianDate.now()).positions;
            const r      = Cesium.Rectangle.fromCartesianArray(coords);
            if (Cesium.Rectangle.contains(r, plantCarto)) {
                targetRect = r;
                return true;
            }
            return false;
        });

        // 4. Add a semi‑transparent white rectangle with a thicker outline
        const highlight = viewerInstance.entities.add({
            id: 'randomRectHighlight',
            rectangle: {
                coordinates: sampleRect,
                material:      Cesium.Color.RED.withAlpha(1.0),
                outline:       true,
                outlineColor:  Cesium.Color.WHITE,
                outlineWidth:  6,
                height:        1000,
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
            }
        });

        // 5. Every 200 ms, jump to a random cell until time’s up, then settle.
        const stepMs   = 200;
        const steps    = durationSeconds * 1000 / stepMs;
        let   current  = 0;
        const handle = setInterval(() => {
            if (++current >= steps) {
                clearInterval(handle);
                highlight.rectangle.coordinates = targetRect;
                // Turn the highlight green once it settles on the target
                highlight.rectangle.material = Cesium.Color.GREEN.withAlpha(1.0);
                highlight.rectangle.outlineColor = Cesium.Color.WHITE;
                highlight.rectangle.outlineWidth = 20;

                resolve();
            } else {
                const w = minW  + Math.random() * (maxE - minW - cellW);
                const s = minS  + Math.random() * (maxN - minS - cellH);
                const randR = new Cesium.Rectangle(w, s, w + cellW, s + cellH);
                highlight.rectangle.coordinates = randR;
            }
        }, stepMs);
    });
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


function changeLegendTitleFadeIn(newTitle, durationMs = 500) { // Duration for the fade-in part
    if (!legendTitleElement) {
        console.warn("Legend title element not found for animation.");
        return;
    }

    // Store any existing inline transition style (though likely none)
    const originalInlineTransition = legendTitleElement.style.transition;

    // 1. Disable CSS transitions temporarily for an instant change
    legendTitleElement.style.transition = 'none';

    // 2. Set opacity to 0 instantly (no transition happens)
    legendTitleElement.style.opacity = 0;

    // 3. Change the text content *immediately* after hiding.
    // We use a very short setTimeout (or could use requestAnimationFrame)
    // to allow the browser to process the opacity change before we
    // potentially re-enable transitions.
    setTimeout(() => {
        legendTitleElement.textContent = newTitle;

        // 4. Force browser reflow (optional but can help ensure order)
        // This makes sure the browser 'sees' the opacity = 0 state
        // before applying the transition for the fade-in.
        void legendTitleElement.offsetHeight;

        // 5. Re-enable the CSS transition (or restore original, or set specific)
        // We specifically want to transition the opacity property now.
        legendTitleElement.style.transition = `opacity ${durationMs / 1000}s ease-in-out`;
        // If you had other transitions defined in CSS, you might restore:
        // legendTitleElement.style.transition = originalInlineTransition || ''; // Restore if needed

        // 6. Set opacity back to 1 - this will now trigger the fade-in transition
        legendTitleElement.style.opacity = 1;

    }, 10); // Small delay (e.g., 10ms) usually sufficient
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

async function addNlcLayer(year) {
    // Load NLC GeoJSON and add to viewer
    const url = `./data/geojson/nlc/${year}_nlc.geojson`;
    const nlcDs = await Cesium.GeoJsonDataSource.load(url, {
        clampToGround: true
    });
    nlcDs.name = `${year}_nlc`;
    await viewer.dataSources.add(nlcDs);
    // Keep NLC layer hidden on map
    nlcDs.show = false;

    // Compute min/max for NLC property
    const values = nlcDs.entities.values.map(entity =>
        entity.properties.NLC.getValue(Cesium.JulianDate.now())
    );
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    // Colorize each polygon based on normalized NLC value
    nlcDs.entities.values.forEach(entity => {
        const val = entity.properties.NLC.getValue(Cesium.JulianDate.now());
        let t = (val - minVal) / (maxVal - minVal);
        t = Math.min(Math.max(t, 0), 1);
        const color = Cesium.Color
            .lerp(Cesium.Color.GREEN, Cesium.Color.RED, t, new Cesium.Color())
            .withAlpha(0.8);

        if (entity.polygon) {
            entity.polygon.material = color;
            entity.polygon.outline = true;
            entity.polygon.outlineColor = Cesium.Color.BLACK;
            entity.polygon.outlineWidth = 1;
        }
    });

    
}

// --- Main Animation Sequence ---
async function runSequence(viewerInstance, baseLon, baseLat, baseHeight) {
    // NOTE: This sequence targets the user-confirmed ROI: Lon ~-109.9, Lat ~41.5 (WY/UT/CO area)
    if (!viewerInstance || !legendTitleElement) {
        console.error("Viewer instance or Legend Title Element not available for runSequence.");
        return;
    }
    // console.log("Starting sequence...");


        // add delay in here to let the icon show
        await new Promise(resolve => setTimeout(resolve, 500));

        // show wyoming
        const wyomingGeoJson = "./data/geojson/wyoming.geojson";
        
        // Load Wyoming boundary with no fill, then draw thick white dashed outline with thin black dashed over it
        const wyomingDs = await Cesium.GeoJsonDataSource.load(wyomingGeoJson, {
            clampToGround: true,
            fill: Cesium.Color.TRANSPARENT,
            stroke: Cesium.Color.TRANSPARENT
        });
        viewer.dataSources.add(wyomingDs);
        // Draw Wyoming boundary and label
        wyomingDs.entities.values.forEach(entity => {
            if (entity.polygon && entity.polygon.hierarchy) {
                const hierarchy = entity.polygon.hierarchy.getValue(Cesium.JulianDate.now());
                const positions = hierarchy.positions;
                // Thick white dashed line
                viewer.entities.add({
                    polyline: {
                        positions,
                        material: new Cesium.PolylineDashMaterialProperty({
                            color: Cesium.Color.WHITE,
                            dashLength: 16.0
                        }),
                        width: 3,
                        clampToGround: true
                    }
                });
                // Label the state using its "name" property
                const stateNameProperty = entity.properties && (entity.properties.name || entity.properties.NAME);
                const stateName = stateNameProperty
                    ? stateNameProperty.getValue(Cesium.JulianDate.now())
                    : entity.name;
                const centroid = Cesium.BoundingSphere.fromPoints(positions).center;
                viewer.entities.add({
                    position: centroid,
                    label: {
                        text: stateName,
                        font: '16px sans-serif',
                        fillColor: Cesium.Color.WHITE,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 2,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        verticalOrigin: Cesium.VerticalOrigin.CENTER,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                    }
                });
            }
        });
        // Wait additional time to allow Wyoming polygon and label to be seen
        await new Promise(resolve => setTimeout(resolve, 2500));
        // Now fly to the ROI
        await flyToLocation(viewerInstance, baseLon, baseLat, baseHeight);

    // add delay in here to let the icon show
    await new Promise(resolve => setTimeout(resolve, 1000));


    // --------------------------------------------------------------------------------
    // 1. ADD SUITABILITY LAYERS
    // --------------------------------------------------------------------------------

    const suitabilityLayerIds = [
        'id_suitability0', 
        'id_suitability1', 
        'id_suitability2', 
        'id_suitability3', 
        'id_suitability4', 
        'id_suitability5', 
        'id_suitability6', 
        'id_suitability7', 
        'id_suitability8', 
        'id_suitability9', 
        'id_suitability10', 
        'id_suitability11', 
        'id_suitability12', 
        'id_suitability13', 
        'id_suitability14', 
    ];

    if (addSuitabilityLayers) {

        // Update title
        changeLegendTitleFadeIn("Unsuitable Gas Plant Area");

        const suitability0 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/lakes_reserv_clipped.geojson', polygonOptions),
            'id_suitability0',
            'Lakes, Reservoirs, and other Water Bodies',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability1 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/airports_clipped.geojson', polygonOptions),
            'id_suitability1',
            'Airport Areas',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability2 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/slope_clipped.geojson', polygonOptions),
            'id_suitability2',
            'Slope Exceedance',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability3 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/cooling_water_clipped.geojson', polygonOptions),
            'id_suitability3',
            'Inadequate Cooling Water Supply',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability4 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/population_clipped.geojson', polygonOptions),
            'id_suitability4',
            'Densely Populated Areas',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability5 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/flood_risk_clipped.geojson', polygonOptions),
            'id_suitability5',
            'Areas with High Flood Risk',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability6 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/wilderness_study_areas_clipped.geojson', polygonOptions),
            'id_suitability6',
            'Wilderness Study Areas',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability7 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/historic_trails_clipped.geojson', polygonOptions),
            'id_suitability7',
            'National Historic Trails',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability8 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/national_desig_areas_clipped.geojson', polygonOptions),
            'id_suitability8',
            'USFS Nationally Designated Areas',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability9 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/bor_management_areas_clipped.geojson', polygonOptions),
            'id_suitability9',
            'USBOR Management Areas',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability10 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/wetlands_clipped.geojson', polygonOptions),
            'id_suitability10',
            'Wetlands',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability11 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/nat_reg_property_clipped.geojson', polygonOptions),
            'id_suitability11',
            'National Register Properties',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability12 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/spec_rec_management_clipped.geojson', polygonOptions),
            'id_suitability12',
            'Special Recreation Management Areas',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability13 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/visual_resource_clipped.geojson', polygonOptions),
            'id_suitability13',
            'Visual Resource Management Areas',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    
        const suitability14 = await addLayerSequentially(
            viewer,
            () => Cesium.GeoJsonDataSource.load('./data/geojson/suitability/other_protected_areas_clipped.geojson', polygonOptions),
            'id_suitability14',
            '40 Other Exclusion Layers',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>',
            suitabilityDelayMs
        );
        
    }
    // --------------------------------------------------------------------------------
    // ADD GAS PIPELINES LAYER
    // --------------------------------------------------------------------------------
    if (addGasPipelines){

        // Add gas pipelines lines layer to the legend with a dotted symbol
        addLegendItem(
            'pipelines_clipped',
            'Gas Pipelines',
            '<div class="legend-symbol" style="width:20px; height:0px; border-bottom:2px dashed aqua;"></div>'
        );
        // Load all gas pipelines clamped to ground
        const pipelineDs = await Cesium.GeoJsonDataSource.load('./data/geojson/wyoming_clip_pipelines.geojson', {
            clampToGround: true
        });
        pipelineDs.name = 'pipelines_clipped';
        await viewer.dataSources.add(pipelineDs);
        pipelineDs.entities.values.forEach(entity => {
            if (entity.polyline) {
                entity.polyline.width = 2;
                // Use a dashed material for a dotted line effect
                entity.polyline.material = new Cesium.PolylineDashMaterialProperty({
                    color: Cesium.Color.AQUA,
                    dashLength: 10.0
                });
                entity.polyline.clampToGround = true;
            }
        });
    }

    await new Promise(resolve => setTimeout(resolve, pipelineWaitMs));
    
    // --------------------------------------------------------------------------------
    // ADD TRANSMISSION LINES LAYER
    // --------------------------------------------------------------------------------
    if (addTransmissionLines){
        // Add transmission lines layer to the legend
        addLegendItem(
            'transmission_clipped',
            'Transmission Lines',
            '<div class="legend-symbol" style="background-color:orange; width:20px; height:2px;"></div>'
        );
        // Load all transmission lines clamped to ground
        const transmissionDs = await Cesium.GeoJsonDataSource.load('./data/geojson/wyoming_clip_transmission.geojson', {
            clampToGround: true
        });
        transmissionDs.name = 'transmission_clipped';
        await viewer.dataSources.add(transmissionDs);
        transmissionDs.entities.values.forEach(entity => {
            if (entity.polyline) {
                entity.polyline.width = 2;
                entity.polyline.material = Cesium.Color.ORANGE;
                entity.polyline.clampToGround = true;
            }
        });
    }

    await new Promise(resolve => setTimeout(resolve, transmissionlineWaitMs));

    // --------------------------------------------------------------------------------
    // ADD POWER PLANT LAYERS
    // --------------------------------------------------------------------------------
    if (addPowerPlantLayers) {

        // console.log("Transitioning to Power Plant phase...");
        changeLegendTitleFadeIn("Projected Gas Plant Siting")

        // remove suitability layers from legend
        const removeLayers = [...suitabilityLayerIds];
        clearSpecificLegendItems(removeLayers); // Clear old legend items
        
        addLegendItem(
            'unsuitable_areas',
            'Unsuitable Gas Plant Areas',
            '<div class="legend-symbol" style="background-color:rgba(0,0,0,0.5); border:1px solid #fff;"></div>'
        );
        // Ensure “Unsuitable Gas Plant Areas” appears as the first entry under the header/icon
        const uaItem = legendItems['unsuitable_areas'];
        if (uaItem) {
            const firstExisting = Array.from(legendDiv.children).find(el =>
                el.id.startsWith('legend-item-') && el !== uaItem
            );
            if (firstExisting) {
                legendDiv.insertBefore(uaItem, firstExisting);
            } else {
                // Fallback: just append if no other legend items exist
                legendDiv.appendChild(uaItem);
            }
        }

        // Short pause after clearing legend
        await new Promise(resolve => setTimeout(resolve, 1500)); 

        // --- Load Power Plant Layers (Loop through years) ---
        // console.log("Loading power plant layers...");
        const powerPlantYears = [2030, 2035, 2040, 2045, 2050];
        const iconBase = './data/markers/round_gas_icon.png'; // Store base path
        let previousNlcYear = null;

        for (const year of powerPlantYears) {
 
            // Example usage: add the 2030 NLC layer
            await addNlcLayer(year);

            // Brief pause to let the new NLC layer render before removing the old one
            // await new Promise(resolve => setTimeout(resolve, 1000));

            // Now remove the old NLC layer to avoid a flashing gap
            if (previousNlcYear !== null) {
                removeLegendItem(`${previousNlcYear}_nlc`);
                viewerInstance.dataSources
                    .getByName(`${previousNlcYear}_nlc`)
                    .forEach(ds => viewerInstance.dataSources.remove(ds, true));
            }
            previousNlcYear = year;

            // Wait before adding the power plant layer
            await new Promise(resolve => setTimeout(resolve, 2500));

            const filename = `./data/geojson/${year}_gas_plants_clipped.geojson`;
            const layerId = `${year}_gas_plants_clipped`;
            const legendTitle = `${year}`; // Legend entry is just the year
            const legendSymbol = `<img src="${iconBase}" class="legend-symbol-img" alt="${year} Gas Plant">`; // Use icon in legend

            // Define the list of legend item IDs to KEEP when clearing
            const itemsToKeep = ['transmission_clipped', 'unsuitable_areas', 'pipelines_clipped', `${year}_nlc`];

            // Call addLegendItem: clear items (true), but exclude itemsToKeep
            addLegendItem(layerId, legendTitle, legendSymbol, true, itemsToKeep);

            // Format legend text:  find the element we just added by its constructed ID
            const legendDomId = `legend-item-${layerId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
            const legendElement = document.getElementById(legendDomId);
            if (legendElement) {
                legendElement.classList.add('power-plant-legend-item'); // Add the CSS class
                const span = legendElement.querySelector('span');
                if (span) {
                    span.style.setProperty('font-size', '30px', 'important');
                    span.style.setProperty('color', '#ffffff', 'important');
                }
                const img = legendElement.querySelector('img.legend-symbol-img');
                if (img) {
                    img.style.width = '30px';
                    img.style.height = '30px';
                }
                // console.log(`Added class 'power-plant-legend-item' to ${layerId}`);
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
            // Hide all power plant icons until after highlight animation
            pptDataSource.show = false;

            // Visibility and Styling Logic
            if (pptDataSource) {
                // console.log(`Successfully loaded ${layerId}. Applying styles...`);

            // Compute 100 km buffer around this year's plant and display it
            const plantEntity = pptDataSource.entities.values[0];
            const plantPos = plantEntity.position.getValue(Cesium.JulianDate.now());
            const plantCarto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(plantPos);
            const bufferMeters = 15000;
            const earthRadius = Cesium.Ellipsoid.WGS84.maximumRadius;
            const angularDistance = bufferMeters / earthRadius;
            
            // Random offset so rectangles still contain the plant but are not centered
            const maxLatOffset = angularDistance / 2;
            const maxLonOffset = (angularDistance / Math.cos(plantCarto.latitude)) / 2;
            const deltaLat = (Math.random() * 2 - 1) * maxLatOffset;
            const deltaLon = (Math.random() * 2 - 1) * maxLonOffset;
            const south = plantCarto.latitude - angularDistance;
            const north = plantCarto.latitude + angularDistance;
            const west = plantCarto.longitude - angularDistance / Math.cos(plantCarto.latitude);
            const east = plantCarto.longitude + angularDistance / Math.cos(plantCarto.latitude);
            // Apply the same random offset so the maskRect shifts identically
            const maskRect = new Cesium.Rectangle(
                west  + deltaLon,
                south + deltaLat,
                east  + deltaLon,
                north + deltaLat
            );
            
            // Compute a larger second “show” rectangle to contain intersecting polygons
            const extraArea = 150 * 1e6;
            const oldSide = 2 * bufferMeters;
            const newSide = Math.sqrt(oldSide * oldSide + extraArea);
            const extraDist = (newSide - oldSide) / 2;
            const showBuffer = bufferMeters + extraDist;
            const showAng = showBuffer / earthRadius;
            const south2 = plantCarto.latitude - showAng + deltaLat;
            const north2 = plantCarto.latitude + showAng + deltaLat;
            const west2  = plantCarto.longitude - (showAng / Math.cos(plantCarto.latitude)) + deltaLon;
            const east2  = plantCarto.longitude + (showAng / Math.cos(plantCarto.latitude)) + deltaLon;
            const showRect = new Cesium.Rectangle(west2, south2, east2, north2);

            // Draw the semi-transparent rectangle without outline
            viewerInstance.entities.add({
                id: 'showRectMask',
                rectangle: {
                  coordinates: showRect,
                  material: Cesium.Color.BLACK.withAlpha(0.3),
                  outline: false,
                  height: 0,
                  heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
                }
            });
            // Draw a separate polyline to outline the rectangle with thicker width
            viewerInstance.entities.add({
                id: 'showRectOutline',
                polyline: {
                    positions: Cesium.Cartesian3.fromRadiansArray([
                        showRect.west, showRect.south,
                        showRect.east, showRect.south,
                        showRect.east, showRect.north,
                        showRect.west, showRect.north,
                        showRect.west, showRect.south
                    ]),
                    width: 3,
                    material: Cesium.Color.WHITE,
                    clampToGround: false,
                    heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
                }
            });

            // Animate random box that converges on power plant location
            await animateRandomHighlight(
                viewerInstance,
                viewerInstance.dataSources.getByName(`${year}_nlc`)[0],
                pptDataSource,
                10.0,
                maskRect
            );

            // Brief pause before citing the power plant icon
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Ensure current data source is visible
            // (Removed: pptDataSource.show = true;)

            // Wait one second, then clean up both rectangles before moving on
            await new Promise(r => setTimeout(r, 1000));
                ['showRectMask','showRectOutline','randomRectHighlight']
                .forEach(id => {
                const e = viewerInstance.entities.getById(id);
                if (e) viewerInstance.entities.remove(e);
            });

            // Apply styling to billboards
            pptDataSource.entities.values.forEach(function(entity) {

                if (Cesium.defined(entity.billboard)) {
                    // Lift each icon to a fixed 5000 m altitude
                    const origPos = entity.position.getValue(Cesium.JulianDate.now());
                    const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(origPos);
                    const lon = Cesium.Math.toDegrees(carto.longitude);
                    const lat = Cesium.Math.toDegrees(carto.latitude);
                    const height = 5000; // meters above ellipsoid
                    entity.position = new Cesium.ConstantPositionProperty(
                        Cesium.Cartesian3.fromDegrees(lon, lat, height)
                    );
                    // Style the billboard
                    entity.billboard.image = iconBase;
                    entity.billboard.heightReference = Cesium.HeightReference.NONE;
                    entity.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                    entity.billboard.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
                    entity.billboard.scale = 0.025; // icon size
                    entity.billboard.disableDepthTestDistance = Number.POSITIVE_INFINITY;
                } else if (Cesium.defined(entity.point)) {
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
                removeLegendItem(`${year}_nlc`);
                removeLegendItem(layerId);
                // Remove the NLC layer data source now that we’re done with this year
                viewerInstance.dataSources.getByName(`${year}_nlc`).forEach(ds => {
                    viewerInstance.dataSources.remove(ds, true);
                });


            } else {
                // FAILURE: Current year FAILED to load
                console.log(`Layer ${layerId} failed to load (likely missing file). Previous layer remains visible.`);
                // Legend item remains visible. Previous layer remains visible.
                // Do NOT update previousPptDataSource
                removeLegendItem(layerId); // Remove legend item if load failed
            }

        } // End of year loop

        // ---------------------------------------------
        //  EXTRACT TARGET POWER PLANTS
        // ---------------------------------------------

        const keepId = "c_406381244";
        const keepYear = 2040;

        powerPlantYears.forEach(year => {
            const dsArray = viewer.dataSources.getByName(`${year}_gas_plants_clipped`);
            dsArray.forEach(ds => {
                if (year !== keepYear) {
                    // Remove entire datasource for other years
                    viewer.dataSources.remove(ds, true);
                } else {
                    // Only keep the target feature in the 2040 layer
                    ds.entities.values.slice().forEach(entity => {
                        const prop = entity.properties && entity.properties.cerf_plant;
                        const idVal = prop ? prop.getValue(Cesium.JulianDate.now()) : null;
                        if (idVal !== keepId) {
                            ds.entities.remove(entity);
                        }
                    });
                    // Clamp the remaining target entity to the ground
                    const targetEntity = ds.entities.getById(keepId);
                    if (targetEntity) {
                        if (Cesium.defined(targetEntity.billboard)) {
                            targetEntity.billboard.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
                        } else if (Cesium.defined(targetEntity.point)) {
                            targetEntity.point.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
                        }
                    }
                }
            });
        });

    } // end add power plants

    asdf;

    // ---------------------------------------------
    //  BUFFERED CIRCLE OF INTEREST
    // ---------------------------------------------

    await new Promise(resolve => setTimeout(resolve, 2500));

    // Add buffer circle to legend
    addLegendItem(
        'powerPlantBuffer',
        'Explore Power Plant',
    '<div class="legend-symbol" style="width:20px; height:20px; border-radius:50%; background-color:rgba(246, 255, 0, 0.98); border:2px solid green;"></div>'
    );

    // Add a 2 km red buffer circle around the target power plant
    let bufferLon, bufferLat;
    const bufferRadius = 15000; // meters
    const ds2040 = viewer.dataSources.getByName('2040_gas_plants_clipped')[0];
    if (ds2040) {
        const target = ds2040.entities.values.find(entity => {
            const prop = entity.properties && entity.properties.cerf_plant;
            return prop && prop.getValue(Cesium.JulianDate.now()) === "c_406381244";
        });
        if (target && target.position) {
            const pos = target.position.getValue(Cesium.JulianDate.now());
            const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(pos);
            bufferLon = Cesium.Math.toDegrees(carto.longitude);
            bufferLat = Cesium.Math.toDegrees(carto.latitude);
        } else {
            console.warn("Target power plant not found; skipping buffer creation");
        }
    }

    if (typeof bufferLon === "number" && typeof bufferLat === "number") {
        viewer.entities.add({
            name: 'powerPlantBuffer',
            position: Cesium.Cartesian3.fromDegrees(bufferLon, bufferLat, 0),
            ellipse: {
                semiMajorAxis: bufferRadius,
                semiMinorAxis: bufferRadius,
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                height: 100, // Lift slightly above ground so it draws on top
                material: Cesium.Color.YELLOW.withAlpha(0.5),
                outline: true,
                outlineColor: Cesium.Color.GREEN,
                outlineWidth: 4
            }
        });
    } else {
        console.warn("Invalid buffer coordinates; buffer not added");
    }

    // --------------------------------------------------------------------------------
    // MAKE 3D MODELS VISIBLE
    // --------------------------------------------------------------------------------

    // After adding power plant layers, make the 3D plant model visible
    viewer.entities.values
    .filter(e => typeof e.id === 'string' && e.id.startsWith('powerPlantModel-main'))
    .forEach(e => { e.show = true; });

    // After making the power plant visible, also show the transmission tower model
    viewer.entities.values
    .filter(e => typeof e.id === 'string' && e.id.startsWith('transmissionTower'))
    .forEach(e => { e.show = true; });

    viewer.entities.values
    .filter(e => typeof e.id === 'string' && e.id.startsWith('transmissionTowerTwo'))
    .forEach(e => { e.show = true; });

    viewer.entities.values
    .filter(e => typeof e.id === 'string' && e.id.startsWith('transmissionTowerThree'))
    .forEach(e => { e.show = true; });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // --------------------------------------------------------------------------------
    // FlY TO CUSTOM LOCATION
    // --------------------------------------------------------------------------------

    changeLegendTitleFadeIn("Explore Individual Plant");
    // Remove the buffer entry from the legend before flying

    removeLegendItem('powerPlantBuffer');

    // Remove the buffer circle before flying
    viewerInstance.entities.values
      .filter(e => e.name === 'powerPlantBuffer')
      .forEach(e => viewerInstance.entities.remove(e));
      
    // Remove the target power plant entity before flying
    const ds2040Remove = viewerInstance.dataSources.getByName('2040_gas_plants_clipped')[0];
    if (ds2040Remove) {
      const targetPlant = ds2040Remove.entities.getById('c_406381244');
      if (targetPlant) {
        ds2040Remove.entities.remove(targetPlant);
      }
    }
    
    // Remove all power plant icon data sources before flying
    ['2030', '2035', '2040', '2045', '2050'].forEach(year => {
      const dsList = viewerInstance.dataSources.getByName(`${year}_gas_plants_clipped`);
      dsList.forEach(ds => {
        viewerInstance.dataSources.remove(ds, true);
      });
    });

    const flyToDuration = 15.0;
    const flyToLon = -110.553675;
    const flyToLat = 41.318206;
    const flyToHeight = 2296;
    const flyToHeading = 156;
    const flyToPitch = -23;

    // Fly to the footprint of the target power plant
    await flyToLocation(
        viewerInstance, 
        bufferLon, 
        bufferLat,
        2296 + 10000, 
        0, 
        -90, 
        10
    );

    // --------------------------------------------------------------------------------
    // ADD IN PARTIAL TRANSMISSION LINE WITH GLOW FORMATTING
    // --------------------------------------------------------------------------------
    
    // Isolate and elevate the transmission line with FID = 69025 before model fly-to
    const ds = viewerInstance.dataSources.getByName('transmission_clipped')[0];
    
    if (ds) {
        ds.entities.values.slice().forEach(entity => {
            const fidProp = entity.properties && (entity.properties.FID || entity.properties.fid);
            const fid = fidProp ? fidProp.getValue(Cesium.JulianDate.now()) : null;
            if ([69025, 75053, 75054, 75052, 69024].includes(fid)) {
                // Override its positions to z = 2262.5 and apply glow
                const cartesians = entity.polyline.positions.getValue(Cesium.JulianDate.now());
                const cartographics = Cesium.Ellipsoid.WGS84.cartesianArrayToCartographicArray(cartesians);
                const flat = [];
                cartographics.forEach(c => {
                    flat.push(
                        Cesium.Math.toDegrees(c.longitude),
                        Cesium.Math.toDegrees(c.latitude),
                        2262.5 + 10
                    );
                });
                entity.polyline.positions = Cesium.Cartesian3.fromDegreesArrayHeights(flat);
                entity.polyline.material = pulsatingGlowMaterialSlow;
                entity.polyline.clampToGround = false;
                entity.polyline.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
                entity.polyline.width = 3;
            } else {
                // Remove all other transmission features
                ds.entities.remove(entity);
            }
        });
    }
    // Rename the filtered datasource so it remains after cleaning up the original
    ds.name = 'transmission_clipped_partial';
    
    // Remove the original full transmission layer before the partial glow step
    viewerInstance.dataSources.getByName('transmission_clipped').forEach(ds => {
        viewerInstance.dataSources.remove(ds, true);
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Fly to the side of building of the target power plant showing transmission infrastructure
    if (useCameraFly) {
        // the smooth Cesium flyTo
        await flyToLocation(
          viewerInstance,
          -110.553757, 
          41.319128,
          2338, 
          152, 
          -18, 
          15
        );
      } else {
        // instant jump with fade
        await fadeTransitionTo(
          viewerInstance,
          -110.553757, 
          41.319128,
          2338, 
          152, 
          -18,
          700
        );
      }


    // --------------------------------------------------------------------------------
    // ADD GAS PIPELINE CONNECTOR
    // --------------------------------------------------------------------------------
    await new Promise(resolve => setTimeout(resolve, 2500));

    changeLegendTitleFadeIn("Connect to Pipeline");

    const gasPipelineConnector = viewer.entities.add({
        name: `Gas Pipeline Connector`, // Simplified name maybe
        polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(
                [ -110.551135, // from lon
                    41.315745,  // from lat
                    2200, // from height in m
                    -110.471169, 
                    41.307648, 
                    2200 
                ]
            ),
            width: 10,
            // material: pulsatingGlowMaterialBlue, // Use the shared material
            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
            // clampToGround: false,
            // width: 6,
            material: pulsatingGlowMaterialAqua,
            clampToGround: false,
            arcType: Cesium.ArcType.GEODESIC
        }
    });


    // --------------------------------------------------------------------------------
    // ADD TRANSMISSION CONNECTOR LINE
    // --------------------------------------------------------------------------------
    await new Promise(resolve => setTimeout(resolve, 2500));

    changeLegendTitleFadeIn("Connect to Grid");
    
    // // Now remove suitability layers from the legend
    // clearSpecificLegendItems(suitabilityLayerIds);

    // Ensure you have access to your 'viewer' instance here
    if (typeof viewer !== 'undefined' && viewer) {

        // Set for all connector lines
        const desiredHeightMeters = 2262.5;
        const connectorLineWidth = 4;

        // RIGHT of tower
        const toLatDegLeft = 41.305911;
        const toLonDegLeft = -110.553520;
        const toLatDegRight = 41.305844;
        const toLonDegRight = -110.553610;        

        const connectionLineTopLeft = viewer.entities.add({
            name: `Transmission Connector Top Left (Glowing)`, // Simplified name maybe
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights([ -110.553352, 41.317205, desiredHeightMeters, toLonDegLeft, toLatDegLeft, desiredHeightMeters + 10 ]),
                width: connectorLineWidth,
                material: pulsatingGlowMaterial, // Use the shared material
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                clampToGround: false,
                arcType: Cesium.ArcType.GEODESIC
            }
        });

        const connectionLineMidLeft = viewer.entities.add({
            name: `Transmission Connector Mid Left (Glowing)`,
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights([ -110.553335, 41.317204, desiredHeightMeters - 7.5, toLonDegLeft, toLatDegLeft, desiredHeightMeters - 7.5 + 10 ]),
                width: connectorLineWidth,
                material: pulsatingGlowMaterial, // Use the shared material
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                clampToGround: false,
                arcType: Cesium.ArcType.GEODESIC
            }
        });

        const connectionLineBottomLeft = viewer.entities.add({
             name: `Transmission Connector Bottom Left (Glowing)`,
             polyline: {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights([ -110.5533506, 41.317204, desiredHeightMeters - 14.5, toLonDegLeft, toLatDegLeft, desiredHeightMeters - 14.5 + 10 ]),
                width: connectorLineWidth,
                material: pulsatingGlowMaterial, // Use the shared material
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                clampToGround: false,
                arcType: Cesium.ArcType.GEODESIC
            }
        });

        const connectionLineTopRight = viewer.entities.add({
            name: `Transmission Connector Top Right (Glowing)`,
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArrayHeights([ -110.553498, 41.317205, desiredHeightMeters, toLonDegRight, toLatDegRight, desiredHeightMeters + 10 ]), // Used fromLonDeg/fromLatDeg from original code block
                width: connectorLineWidth,
                material: pulsatingGlowMaterial, // Use the shared material
                heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                clampToGround: false,
                arcType: Cesium.ArcType.GEODESIC
            }
        });

        const connectionLineMidRight = viewer.entities.add({
            name: `Transmission Connector Mid Right (Glowing)`,
            polyline: {
                 positions: Cesium.Cartesian3.fromDegreesArrayHeights([ -110.553518, 41.317205, desiredHeightMeters - 7.5, toLonDegRight, toLatDegRight, desiredHeightMeters - 7.5 + 10 ]),
                 width: connectorLineWidth,
                 material: pulsatingGlowMaterial, // Use the shared material
                 heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                 clampToGround: false,
                 arcType: Cesium.ArcType.GEODESIC
            }
        });

        const connectionLineBottomRight = viewer.entities.add({
             name: `Transmission Connector Bottom Right (Glowing)`,
             polyline: {
                  positions: Cesium.Cartesian3.fromDegreesArrayHeights([ -110.553496, 41.317205, desiredHeightMeters - 14.5, toLonDegRight, toLatDegRight, desiredHeightMeters - 14.5 + 10 ]),
                  width: connectorLineWidth,
                  material: pulsatingGlowMaterial, // Use the shared material
                  heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                  clampToGround: false,
                  arcType: Cesium.ArcType.GEODESIC
             }
        });

    } else {
        console.error("Cesium viewer instance is not available. Cannot add polyline.");
    }

await new Promise(resolve => setTimeout(resolve, 3500));


    // Add a persistent credits popup
    const creditsPopup = document.createElement('div');
    creditsPopup.id = 'creditsPopup';

    creditsPopup.innerHTML = `
    <h2 style="margin:0; color:white;">
        Explore more research from the Integrated Multisector Multiscale Modeling (IM3) project at </br> https://im3.pnnl.gov  
    </h2>
    </br>
    <h5 style="margin:0;  color:white;">
        How to cite:</br>
        Mongird, K., Vernon, C. R., Thurber, T., & Rice, J. S. (2025, April 20). CERF Visualization: Projected locations of new natural gas combined cycle (recirculating cooling) power plants in Wyoming, USA (2020-2050).  https://doi.org/10.57931/2001010
    </h5>
    </br>
    <p style="margin:8px 0 0; font-weight:400; font-size:12px; color:rgba(255,255,255,0.8);">
        Background Satellite Imagery: </br>Data available from the U.S. Geological Survey, © CGIAR-CSI, Produced using Copernicus data and information funded by the European Union - EU-DEM layers, Data available from Land Information New Zealand, Data available from data.gov.uk, Data courtesy Geoscience Australia.
    </p>
  `;
    creditsPopup.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(40, 40, 40, 0.8);
        border: 2px solid #333;
        border-radius: 12px;
        padding: 40px 60px;
        min-width: 200px;
        text-align: center;
        z-index: 1000;
    `;
    // Append to the Cesium container so it sits on top of the map
    cesiumContainer.appendChild(creditsPopup);

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

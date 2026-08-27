import { useState, useRef, useEffect } from 'react'
import * as tf from '@tensorflow/tfjs'
import * as onnxruntime from 'onnxruntime-web'

import CheckResults from "./CheckResults"
import { CLASS_NAMES } from './constants'
import { ASPECT_IMG, INGREDIENT_IMG, GHOST_IMG, RESULT_IMG, ELEMENT_IMG } from './assets/images'

const numClasses = CLASS_NAMES.length; 

// Need to preload the sumbol images so they're available for drawing on the canvas
const INGREDIENT_GHOST_IMGS = {}
Object.entries(GHOST_IMG).map(([ingredient, imageSrc]) => {
    // need to reference 'new Image()' to create HTML element for the image, effectively preloading it 
    INGREDIENT_GHOST_IMGS[ingredient] = new Image();
    INGREDIENT_GHOST_IMGS[ingredient].src = imageSrc;
})

export default function Camera({ setIsCameraOn, session }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const canvasRef = useRef(null);
    const animationFrameIdRef = useRef(null);
    const detectionTimeoutRef = useRef(null);
    const [streamReady, setStreamReady] = useState(false);
    const [videoDims, setVideoDims] = useState({ w: 0, h: 0 });
    const [detectedSymbols, setDetectedSymbols] = useState(null);
    const [confirmedSymbols, setConfirmedSymbols] = useState(null);
    const [ritualResults, setRitualResults] = useState(null);
    const [cameraAccessGranted, setCameraAccessGranted] = useState(false);

    // NB: used useRef here so that detect function doesn't 'close off' the value inside the useEffect (which happens with useState)
    const isPausedRef = useRef(false);
    const unpauseTime = useRef(0);

    // Keep a reference to previous box detections to use for drawing on canvas, to avoid flickering image
    const lastDetectedSymbolsRef = useRef([]);

    // Camera Stream Setup
    useEffect(() => {
        let cameraMounted = true;

        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
            .then((stream) => {
                if (!cameraMounted) { 
                    stream.getTracks().forEach(track => track.stop()); 
                    return; 
                }
                setCameraAccessGranted(true);
                
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    streamRef.current = stream;
                    videoRef.current.play()
                        .then(() => {
                            const w = videoRef.current.videoWidth;
                            const h = videoRef.current.videoHeight;
                            setVideoDims({ w, h });
                            setStreamReady(true);
                        })
                        .catch(err => console.error("Error playing video: ", err));
                }
            })
            .catch(err => {
                console.error("Camera error:", err);
                setIsCameraOn(false);
            });
            

        // Clean up camera and engine on component dismount
        return () => {
            cameraMounted = false;
            streamRef.current?.getTracks().forEach(track => track.stop());
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
            tf.disposeVariables();
        };
    }, []);




    // Get ritual results when symbol triad is confirmed
    useEffect(() => {
        if (!confirmedSymbols) return;

        const aspect = CLASS_NAMES[confirmedSymbols[0].classId];
        const element1 = CLASS_NAMES[confirmedSymbols[1].classId];
        const element2 = CLASS_NAMES[confirmedSymbols[2].classId];
        console.log(`${aspect} ${element1} ${element2}`);

        fetch(`${import.meta.env.VITE_API_URL}/api/perform_ritual/`, {
            method: "POST",
            credentials: "include",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ aspect, element1, element2 })
        })
            .then(res => res.json())
            .then(data => {
                console.log("Got result: ", data);
                setRitualResults({ 
                    result: data.ritual_result, 
                    message: data.ritual_message, 
                    ritualName: data.ritual_name, 
                    aspect: data.aspect, 
                    element1: data.element1, 
                    element2: data.element2, 
                    aspectIngredient: data.aspect_ingredient, 
                    element1Ingredient: data.element1_ingredient, 
                    element2Ingredient: data.element2_ingredient, 
                    effectImage: data.effect_image, 
                    fragment: data.fragment, 
                    instruction: data.instruction, 
                    messageAlignment: data.message_alignment 
                });
            })
            .catch(err => {
                console.error(err);
            })
    }, [confirmedSymbols]);


    // Loop drawing detected symbols on canvas (to give user feedback that they're being detected)
    useEffect(() => {
        function draw() {
            if (canvasRef.current) {
                const overlay = canvasRef.current.getContext("2d");
                overlay.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

                // Skip drawing for 1 second to clear out old frames after resuming detection
                if (Date.now() - unpauseTime.current > 1000) {
                    overlay.shadowColor = 'cyan';
                    overlay.shadowBlur = 10;

                    lastDetectedSymbolsRef.current.forEach(symbol => {
                        const ingredient = CLASS_NAMES[symbol.classId];
                        const img = INGREDIENT_GHOST_IMGS[ingredient];
                        overlay.drawImage(img, symbol.x, symbol.y, symbol.w,symbol.h);
                    });
                    
                    overlay.shadowColor = 'transparent';
                    overlay.shadowBlur = 0;
                }
            }
            if (!isPausedRef.current) {
                animationFrameIdRef.current = requestAnimationFrame(draw);
            }

            // DEBUG: Memory leak test!!!
            // console.log(tf.memory());
        }

        draw();
        return () => cancelAnimationFrame(animationFrameIdRef.current);
    }, [detectedSymbols]);

    // Use nonMaxSuppression function to prevent duplicate detection boxes
    // NB: Use nonMaxSuppressionAsync so thread isn't blocked
    // Dispose of all tensors manually (javascript won't handle them because they're in GPU)!!!
    // Name all tensors explicitly so I can confrim they're disposed 
    async function suppressDuplicateBoxes(boxes, boxOverlapThreshold = 0.45) {
        if (boxes.length === 0) return [];

        const keptBoxes = [];
        const classes = boxes.map(box => box.classId);
        const uniqueClassIds = [... new Set(classes)];

        for (const classId of uniqueClassIds) {
            const matchedBoxes = boxes.filter(box => box.classId === classId);
            // convert box measurements into [y1, x1, y2, x2] format for tf.image.nonMaxSuppression
            const boxCornersTensor = tf.tensor2d(
                matchedBoxes.map(box => [box.y, box.x, box.y + box.h, box.x + box.w])
            );
            // extract the confidence values as a separate 1D tensor
            const boxScoresTensor = tf.tensor1d(matchedBoxes.map(box => box.confidence));

            // Use try / finally to make sure tensors get disposed if there's an error
            try {
                const indiciesTensor = await tf.image.nonMaxSuppressionAsync(boxCornersTensor, boxScoresTensor, matchedBoxes.length, boxOverlapThreshold);
                const indicies = await indiciesTensor.array();
                indiciesTensor.dispose();
                indicies.forEach(i => keptBoxes.push(matchedBoxes[i]));
            } finally {
                tf.dispose([boxCornersTensor, boxScoresTensor]);
            }
        }

        return keptBoxes;
    }


    // Return detected symbols
    async function detections(output, canvas, leftPadding = 0, topPadding = 0, confThreshold = 0.25) {
        const overlay = canvas.getContext("2d");
        overlay.clearRect(0, 0, canvas.width, canvas.height);
    
        // scale canvas from yolo detection size to actual video size
        const yoloDetectionSize = 640;
        // Find the reversed scaling ratio
        const scale = Math.min(yoloDetectionSize / canvas.width, yoloDetectionSize / canvas.height);
        const scaleBack = 1 / scale;
    
        // Get number of anchors (the different areas the model checks to see if a symbol is recognised)
        const numAnchors = output.dims[2];

        // tf.js tensor shape is [1, 22, 8400] for [batch data, 4 coords + 18 classes, anchors]
        const outputTensor = tf.tensor(output.data, [1, output.dims[1], numAnchors]);
        // slice the output to remove 4 coord rows 
        const classScoresTensor = outputTensor.slice([0, 4, 0], [1, numClasses, numAnchors]);
        // tf.argMax gets the index with the max value in the class dimension for each anchor
        // (which tells us which class is most detected in that anchor)
        // Then use squeeze to remove all size 1 dimensions, removing the batch dimension
        const classIdsWithBatchTensor = tf.argMax(classScoresTensor, 1)
        const classIdsTensor = classIdsWithBatchTensor.squeeze();

        // Get the highest confidence score for each anchor  
        const confScoresWithBatchTensor = tf.max(classScoresTensor, 1)
        const confScoresTensor = confScoresWithBatchTensor.squeeze();

        const classIdsArray = await classIdsTensor.array();
        const confScoresArray = await confScoresTensor.array();

        // dispose manually of all tensors!!!
        tf.dispose([outputTensor, classScoresTensor, classIdsTensor, confScoresTensor, classIdsWithBatchTensor, confScoresWithBatchTensor]);

        const boxes = [];
    
        // loop through each anchor; if confidence is above our threshold, add to detected symbols
        for (let i = 0; i < numAnchors; i++) {
            if (confScoresArray[i] < confThreshold) continue;
    
            // This box has qualified – get its position data
            const centerX = output.data[0 * numAnchors + i];
            const centerY = output.data[1 * numAnchors + i];
            const w  = output.data[2 * numAnchors + i];
            const h  = output.data[3 * numAnchors + i];

            // Convert YOLO's centered format into 'top-left corner' format to draw detected symbols, and scale it into the video space
            const x = (centerX - w / 2 - leftPadding) * scaleBack;
            const y = (centerY - h / 2 - topPadding) * scaleBack;
            const scaledW = w * scaleBack;
            const scaledH = h * scaleBack;
    
            boxes.push({ centerX, centerY, x, y, w: scaledW, h: scaledH, classId: classIdsArray[i], confidence: confScoresArray[i] });
        }
    
        const keptBoxes = await suppressDuplicateBoxes(boxes);

        // Store detected symbols for drawing on canvas
        lastDetectedSymbolsRef.current = keptBoxes;
    
        // Allow time after unpausing the video feed before checking for legit symbol combo, to clear out detection queue
        // (Otherwise it instantly detects the same symbols as previously)
        if (Date.now() - unpauseTime.current < 500) {
            return;
        }

        // Make sure we're detecting 3 objects, no more, no less
        if (keptBoxes.length == 3) {
            let symbolHeightOrder = [];
            let topSymbolY = videoDims.h;
            
            // Order symbols by height they appear, top to bottom
            // NB: y=0 is the top of the screen!!!
            for (let i = 0; i < keptBoxes.length; i++) {
                if (keptBoxes[i].centerY < topSymbolY) {
                    symbolHeightOrder.splice(0, 0, keptBoxes[i]);
                    topSymbolY = keptBoxes[i].centerY;
                }
                else if (i > 1) {
                    if (keptBoxes[i].centerY < symbolHeightOrder[1].centerY) {
                        symbolHeightOrder.splice(1, 0, keptBoxes[i]);
                    }
                    else {
                        symbolHeightOrder.push(keptBoxes[i]);
                    }
                }
                else {
                    symbolHeightOrder.push(keptBoxes[i]);
                }
            }

            symbolHeightOrder.forEach(symbol => {
                console.log(CLASS_NAMES[symbol.classId]);
            });

            // Get the average box height of the detected symbols, so we can make
            // sure the top detected symbol is significantly above the other two
            // (since there should be one card played at the top, and two below,
            // in a triangle shape)
            const averageBoxHeight = (symbolHeightOrder[0].h + symbolHeightOrder[1].h + symbolHeightOrder[2].h) / 3
            const lowerSymbolsMidpointY = (symbolHeightOrder[1].centerY + symbolHeightOrder[2].centerY) / 2
            // Check that the upper symbol is at least half a box height above the mid-point of the bottom two symbols
            if (lowerSymbolsMidpointY - symbolHeightOrder[0].centerY < averageBoxHeight) {
                console.log("One symbol not clearly above the others")
                return;
            }

            // Order the bottom two symbols correctly left-to-right
            if (symbolHeightOrder[2].centerX < symbolHeightOrder[1].centerX) {
                const holder = symbolHeightOrder[1];
                symbolHeightOrder[1] = symbolHeightOrder[2];
                symbolHeightOrder[2] = holder;
            }

            // Pause video feed to get user confirmation on legit symbol combo
            isPausedRef.current = true;
            videoRef.current.pause();

            setDetectedSymbols(symbolHeightOrder);
        }
    }


    // Detection Loop
    useEffect(() => {
        if (!session || !streamReady) return;
        let isRunning = false;
    
        function detect() {
            if (isPausedRef.current) return;
            if (videoRef.current?.readyState >= 2 && !isRunning) {
                isRunning = true;

                // DEBUG: DETECTION TIME
                const detectionStart = performance.now();

                // Calculations so we can create a 'square' video feed (to match the original YOLO training format)
                const h = videoRef.current.videoHeight;
                const w = videoRef.current.videoWidth;
                const longestSide = Math.max(h, w);
                const topPadding = Math.floor((longestSide - h) / 2);
                const bottomPadding = longestSide - h - topPadding;
                const leftPadding = Math.floor((longestSide - w) / 2);
                const rightPadding = longestSide - w - leftPadding;

                // Use tf.tidy() to dispose of any tensors created in the course of setting frameDataTensor
                // NB: Still need to dispose of frameDataTensor manually
                const frameDataTensor = tf.tidy(() => {
                    const frame = tf.browser.fromPixels(videoRef.current);

                    // Set up padding to create a square video frame for YOLO detection
                    // (since YOLO model was trained on a 640 x 640 shape)
                    const padded = tf.pad(frame, [[topPadding, bottomPadding], [leftPadding, rightPadding], [0, 0]]);
            
                    // Resize the square down to 640 x 640 for YOLO detection
                    const resized = tf.image.resizeBilinear(padded, [640, 640]);
            
                    // Change pixel values from 0-255 range to 0-1 range for YOLO detection
                    const normalised = resized.div(255.0)
            
                    // NB: YOLO needs [batch, channels, height, width]
                    // Transpose from [height, width, channels] to [channels, height, width] 
                    const transposed = normalised.transpose([2, 0, 1]);
            
                    // Add a batch dimension (number of images being passsed in) of 1 at start of array
                    return transposed.expandDims(0);
                });
                    
                // use tf command '.data' to return a flattened array from tensor, then wrap it with the format YOLO needs
                frameDataTensor.data()
                    .then(data => {
                        frameDataTensor.dispose();
                        const inputTensor = new onnxruntime.Tensor("float32", data, [1, 3, 640, 640]);
                        // hand the tensor array to the YOLO model (via ONNX)
                        return session.run({ images: inputTensor })
                            .then(results => {
                                inputTensor.dispose();
                                const outputTensor = results["output0"];
                                if (outputTensor && canvasRef.current) {
                                    if (isPausedRef.current) {
                                        outputTensor.dispose();
                                        return;
                                    }
                                    return detections(outputTensor, canvasRef.current, leftPadding, topPadding)
                                        .then(() => {
                                            outputTensor.dispose();
                                    });
                                }
                            });
                        })
                    .catch(err => {
                        console.error("Error running detection: ", err);
                    })
                    .finally(() => {
                        isRunning = false;
                        if (!isPausedRef.current) {
                            detectionTimeoutRef.current = setTimeout(detect, 10);
                        };
                        // DEBUG: DETECTION TIME
                        console.log("Detection time: ", (performance.now() - detectionStart).toFixed(1), "ms");
                    });
            } else {
                detectionTimeoutRef.current = setTimeout(detect, 10);
            }
        }
        detect();

        return () => clearTimeout(detectionTimeoutRef.current);
    }, [session, streamReady, detectedSymbols]);


    // Kill the video and animation frames once we've confirmed the symbol conbination
    useEffect(() => {
        if (!confirmedSymbols) return;
        console.log('Cancelling frame:', animationFrameIdRef.current);
        cancelAnimationFrame(animationFrameIdRef.current);
        clearTimeout(detectionTimeoutRef.current);
        streamRef.current?.getTracks().forEach(track => track.stop());
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        console.log("tf.memory on triad detection: ", tf.memory())
    }, [confirmedSymbols]);


    console.log(ritualResults);
                
    return (
        <>
            {confirmedSymbols ? (
                ritualResults && (
                    // Show the results of the ritual for the confirmed symbols
                    <div className="results-page-holder">

                        <div className="ritual-ingredients-holder"> 
                            <div className="ritual-header">{ritualResults.result.toUpperCase()}</div>
                            <div className="results-aspect-holder"> 
                                <img className="ritual-image" src={ASPECT_IMG[ritualResults.aspect.toLowerCase()]} />
                                <img className="top ingredient-image" src={INGREDIENT_IMG[ritualResults.aspectIngredient]} />
                            </div>
                            <div className="ritual-text">{ritualResults.aspect} ritual</div>
                            <div className="ingredient-row">
                                <img className="ingredient-image" src={INGREDIENT_IMG[ritualResults.element1Ingredient]} />
                                <img className="ingredient-image" src={INGREDIENT_IMG[ritualResults.element2Ingredient]} />
                            </div>
                        </div>

                        <div className="vertical-holder result-card">
                            <div className="ritual-text">{ritualResults.message}</div>
                            <div className="ritual-header">{ritualResults.ritualName}</div>
                            <div className="row-holder card">
                                <div className="vertical-holder essences-display">
                                    <div>
                                        <img className="essence-image" src={ELEMENT_IMG[ritualResults.element1]} />
                                        <div className="essence-name">
                                            {ritualResults.element1 === "Equal" ? "Identical essences" : ritualResults.element1}
                                        </div>
                                    </div>
                                    {/* TODO: REMOVE STYLE TO CSS */}
                                    <div style={{ paddingTop: "10px" }}> 
                                        <img className="essence-image" src={ELEMENT_IMG[ritualResults.element2]} />
                                        <div className="essence-name">
                                            {ritualResults.element2 === "Equal" ? "Identical essences" : ritualResults.element2}
                                        </div>
                                    </div>
                                </div>
                                
                                {/* TODO: REMOVE STYLE TO CSS */}
                                <div className="vertical-holder" style={{ paddingLeft: "0px", justifyContent: "flex-end" }}>
                                    <div>
                                        <img className="outcome-image" src={RESULT_IMG[ritualResults.effectImage]} />
                                    </div>
                                    <div className={`instruction ${ritualResults.messageAlignment}`}>{ritualResults.instruction}</div>
                                </div>
                            </div>
                        </div>
                        <div className="button-finish">
                            <button onClick={() => setIsCameraOn(false)}>
                                Finish
                            </button>
                        </div>
                    </div>
                )            
            ) : (
                // Show video stream, ready to detect symbols
                <div className="camera-page-holder">
                    <div>
                        <div className="camera-holder" style={{ opacity: streamReady ? 1 : 0 }}>
                            <video ref={videoRef} autoPlay playsInline />
                            <canvas ref={canvasRef} width={videoDims.w} height={videoDims.h} />
                        </div>
                        {!detectedSymbols && cameraAccessGranted && streamReady &&
                            <button className="button-cancel" onClick={() => setIsCameraOn(false)}>
                                    Cancel
                            </button>
                        }
                    </div>

                    <div className="detected-symbols-holder" style={{ height: window.innerHeight - videoDims.h }}>
                        {(detectedSymbols && !confirmedSymbols) && 
                            // Display detected symbol triad so user can confirm, cancel or recapture symbols
                            <CheckResults 
                                symbols={detectedSymbols} 
                                setDetectedSymbols={setDetectedSymbols} 
                                setConfirmedSymbols={setConfirmedSymbols} 
                                setIsCameraOn={setIsCameraOn} 
                                unpauseTime={unpauseTime}
                                isPausedRef={isPausedRef} 
                                videoRef={videoRef} 
                                lastDetectedSymbolsRef={lastDetectedSymbolsRef}
                            />
                        }
                    </div>
                </div>
            )}
        </>
    );
}
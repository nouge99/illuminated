import { useState, useEffect, useRef } from 'react'
import './App.css'
import Camera from "./Camera"

import * as onnxruntime from 'onnxruntime-web'


function App() {
    const [session, setSession] = useState(null);
    const [arcanaDebug, setArcanaDebug] = useState("");
    const [seed, setSeed] = useState(localStorage.getItem("seed") || "");
    const [newSeedFlag, setNewSeedFlag] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [isEnteringSeed, setIsEnteringSeed] = useState(false);
    const [isConfirmingNewGame, setIsConfirmingNewGame] = useState(false);
    const [seedInput, setSeedInput] = useState("");
    const [confirmationMessage, setConfirmationMessage] = useState("");
    const [showConfirmationPopup, setShowConfirmationPopup] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const seedInputRef = useRef(null);
    const sessionInitialised = useRef(false);

    onnxruntime.env.wasm.numThreads = 1;
    onnxruntime.env.logLevel = 'error';
    onnxruntime.env.wasm.wasmPaths = '/';    


    // Initialise the detection model session
    useEffect(() => {
        if (sessionInitialised.current) return;
        sessionInitialised.current = true;

        onnxruntime.InferenceSession.create("/best.onnx", {
            executionProviders: ["webgpu", "wasm"]
        })
            .then(setSession)
            .catch(console.error);
        
        // ?? Do I need a clean up call to release the session from GPU? 
        // It's in the root app so won't normally need clean up
        return () => {session?.release()}; 
    }, []);    


    // Generate seed on mount if one doesn't exist, use seed to generate arcana setup
    useEffect(() => {
        fetch(`/api/randomise_arcana/${seed}`, {
            method: "GET",
            credentials: "include"
        })
            .then(res => res.json())
            .then(data => {
                console.log("API response:", data);
                setArcanaDebug(data.arcana);
                setSeed(data.seed);
                localStorage.setItem("seed", data.seed);
            }
        );
    }, [newSeedFlag]);


    function generateNewSeed() {
        setSeed("");
        setNewSeedFlag(prev => !prev);
        setIsConfirmingNewGame(false);
    }


    function handleSeedInput(value) {
        // Prevent character entry if not alphabetic, or if string at 5 characters
        if ( (!(value.length > 5)) && (/^[a-zA-Z]*$/.test(value)) ) {
            setSeedInput(value.toUpperCase());
        }
    }

    function validateSeedInput() {
        if (seedInput.length == 5) {
            setErrorMessage("");
            setIsEnteringSeed(false);
            setSeed(seedInput); 
            setSeedInput("");
            setConfirmationMessage("Game code successfully entered");
            setShowConfirmationPopup(true);
        } else {
            setErrorMessage("Game code must have five letters");
            seedInputRef.current.focus();
        }
    }

    return (
        <>  
            {isCameraOn ? (
                <>
                    <Camera 
                        setIsCameraOn={setIsCameraOn} 
                        session={session}
                    />
                </>
            ) : (
                <>
                    <div className="main-page-holder">   
                        <div>
                            <h1>The Illuminated</h1>
                            <h2>board game app</h2>
                        </div>
                        <div className="game-info-box">
                            <h2>Current game code</h2> 
                            <h3>{seed ? seed : "None"}</h3>
                        </div>
                        <div>
                            <button 
                                className={`large-button ${session ? "active" : "loading"}`}  
                                onClick={session ? () => setIsCameraOn(prev => !prev) : undefined}>
                                    {session ? "Begin ritual" : "Loading"}
                            </button>
                        </div>
                        <div className="small-button-holder">
                            <button className="small-button" onClick={() => setIsConfirmingNewGame(true)}>Create new game</button>
                            <button className="small-button" onClick={() => setIsEnteringSeed(true)}>Enter game code</button>
                        </div>
                    </div>

                    {/* DEBUG: Display generated arcana */}
                    {/* <h2 className="debugging arcana-display">Current arcana</h2>
                    <div>
                        <pre>{arcanaDebug ? JSON.stringify(arcanaDebug, null, 2) : "Loading..."}</pre>
                    </div> */}

                </>
            )}
            
            {isConfirmingNewGame && (
                <div className="popup-background">
                    <div className="abandon-game-box">
                        <h4>Abandon the current game?</h4>
                        <div className="row-holder">
                            <button onClick={() => setIsConfirmingNewGame(false)}>Cancel</button>
                            <button onClick={() => { 
                                generateNewSeed(); 
                                setIsConfirmingNewGame(false);
                                setConfirmationMessage("New game created");
                                setShowConfirmationPopup(true);
                            }}>
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {isEnteringSeed && (
                <div className="popup-background input-popup">
                    <div className="seed-input-box">
                        <h4>Enter your game code:</h4>
                        <input  
                            className="seed-input-text" 
                            ref={seedInputRef} 
                            value={seedInput} 
                            onChange={e => handleSeedInput(e.target.value)}
                            placeholder=""
                            autoFocus
                        />
                        <div>{errorMessage}</div>
                        <div className="row-holder">
                            <button onClick={() => { 
                                setErrorMessage("");
                                setIsEnteringSeed(false);
                                setSeedInput("");
                            }}>
                                Cancel
                            </button>
                            <button onClick={() => validateSeedInput()}>Confirm</button> 
                        </div>
                    </div>
                </div>
            )}

            {showConfirmationPopup && (
                <div className="popup-background">
                    <div className="confirmation-popup">
                        <h4>{confirmationMessage}</h4>
                        <button onClick={() => {
                            setConfirmationMessage("");
                            setShowConfirmationPopup(false);
                        }}>
                            Continue
                        </button>
                    </div>
                </div>
            )}

        </>
    )
}

export default App

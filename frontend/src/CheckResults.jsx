import { CLASS_NAMES } from './constants'
import { INGREDIENT_IMG } from './assets/images'

export default function CheckResults({ symbols, setConfirmedSymbols, setDetectedSymbols, setIsCameraOn, unpauseTime, isPausedRef, videoRef, lastDetectedSymbolsRef }) {

    return (
        <>
            <div className="confirm-symbols-holder">
                <div>
                    <div className="symbol-image-holder">
                        <img className="ingredient-image" src={INGREDIENT_IMG[CLASS_NAMES[symbols[0].classId]]} />
                    </div>
                    <div className="symbol-text">
                        {CLASS_NAMES[symbols[0].classId]}
                    </div>
                </div>
                <div className="symbol-row-holder">
                    <div>
                        <div className="symbol-image-holder">
                            <img className="ingredient-image" src={INGREDIENT_IMG[CLASS_NAMES[symbols[1].classId]]} />
                        </div>
                        <div className="symbol-text">
                            {CLASS_NAMES[symbols[1].classId]}
                        </div>
                    </div>
                    <div>
                        <div className="symbol-image-holder">
                            <img className="ingredient-image" src={INGREDIENT_IMG[CLASS_NAMES[symbols[2].classId]]} />
                        </div>
                        <div className="symbol-text">
                            {CLASS_NAMES[symbols[2].classId]}
                        </div>
                    </div>
                </div>
            </div>
            <div className="button-row-holder">
                <button className="button-check-results" onClick={() => setIsCameraOn(false)}>
                    Cancel
                </button>
                <button className="button-check-results" onClick={() => {
                    unpauseTime.current = Date.now();
                    setDetectedSymbols(null);
                    lastDetectedSymbolsRef.current = [];
                    isPausedRef.current = false;
                    videoRef.current.play();
                }}>
                    Recapture
                </button>
                <button className="button-check-results" onClick={() => setConfirmedSymbols(symbols)}>
                    Confirm
                </button>
            </div>
        </>
    )

}

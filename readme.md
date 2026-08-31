# 'The Illuminated' board game app

This is a web app developed as a capstone project for CS50's Web Programming with Python and JavaScript course. 

## Where can I find this app?

It's hosted on the Render platform at:
https://illuminated-yfys.onrender.com

(The backend is also hosted on a Render web service, and called via API calls.)

To properly use the app, you'll need to print out the [ingredient images](./docs/images/ingredients.png) used in the board game, and cut out the cards so you can scan them using the app's symbol detection.

## What is it?

This is a helper app for a board game called 'The Illuminated', a board game in which different factions of a Golden Dawn-style occult society compete to take over as their leader's health fades. 

A core element of the game is deduction. Players try to cast spells by combining different ingredients – and the aspects and effects of those ingredients change from game to game, and need to be deduced by experimentation.

There are more detailed instructions on how the game play and spell casting works in the [How to Play document](./docs/how-to-play.md).

## How do I use it?

When players in the game want to try an ingredient combination, they arrange the three ingredients to be tested in a triangle and use the app to scan the cards. The app detects the cards played, and relays the results of the combination to the player.

Each game instance is given a random 5-letter seed, which players can share to make sure they're all playing in the same randomised game instance.

## How does the app work?

It uses a detection model (Ultralyrics's YOLOv8n model), trained on the 16 symbols used in the game, to detect the symbols on the cards played, then references a database of defined effects along with a randomised game seed to determine the outcome of the symbol combination.

## File structure

### Backend

The Django backend follows the standard Django file structure – with the models defined in models.py, the paths in urls.py, and the main python code in views.py. 

The functions in views are pretty simple. They handle these things, via fetch calls from the front end:
- The creation of a random game seed when needed.
- The hashing of that game seed via a secret key, using a 'hash-based message authentication code' generated using the hmac library.
- the ritual results of a successfully detected 'triangle' of ingredient symbols, using the provided game seed and Django queries to the models containing the spell ritual combination data. 

### Frontend

The Vite + React frontend is doing most of the work here. The React components include:

**App.jsx**
<br>This is (obviosuly) the main app component that renders when the app mounts, which includes these features:  

- A useEffect to initialise the detection session, loading the detection model into memory, and creating the onnxruntime webGPU/wasm inference session.
- A useEffect that sends the current seed (if one exists in localStorage) to the backend to generate the current attributes of the ingredients for this game, and to generate a new seed if one doesn't currently exist. (The ingredient attributes fetches here are only currently used for debugging, but I've left it in for the convenience of future development).
- functions to handle the user generating a new random seed, or inputting their own seed (so they can continue a previous game, or get into the same game instance as fellow players). I've used some regex to put guardrails around the user game code inputs.
- **render logic** 
<br>Conditional rendering with states is used to display modals for inputing or randomising new game codes, and to switch to the video feed display (Camera.jsx) when the user hits the 'begin ritual' button.
<br><br>

**Camera.jsx**
<br>This is the real workhorse component, setting up the video stream and using it for detection, while using a canvas overlay to show the user symbols that are currently being detected. (Arguably I should really break some of these sections out as their own components for clarity... but this project has run way too long for me already.)

Here's what's in it:
- **Camera stream useEffect** 
<br>A useEffect to set up the camera stream, to handle errors or the user declining permission by unmounting the Camera component (to take the user back to the main app screen), and to clean up the camera stream when the component unmounts.
- **Fetch ritual results useEffect** 
<br>A useEffect that kicks in when the user confirms the 3 detected symbols are correct, and fetches the results of the combination from the backend for display.

- **Draw detected symbols useEffect** 
<br>A useEffect that, every time symbols are detected, draws a glowy, transparant version of that symbol on top of the detection area, to show the user that detection is happening.

- **suppressDuplicateBoxes function** 
<br>This checks for duplicate symbol detections very close trother and eliminates the duplicates (to remove the multiple detections that inevitably happen for each symbol instance), using TensorFlow's nonMaxSuppressionAsync function. 

- **detections function** 
<br>This processes the detection model output to find all detected symbols, and keeping the ones that are above a set confidence threshold (to weed out low-confidence detections). This function also checks to see if (after duplicate detections are suppressed) only 3 symbols are being detected, with one symbol clearly above the other two – if so, we set a successful detected symbol batch for approval by the user.

- **Detect useEffect** 
<br>The main detection inference loop, in the form of a useEffect that runs continuously, calling itself again on completion every 10 miliseconds (until paused by successfully detecting a valid trio of synbols). The function converts the video feed into a square shape (to match the square images the detection model was trained on), and converts the frame into the data structure the YOLO model needs, then passes the data to the detection model. We then check the model's output for successful detections.

- **Video cleanup useEffect** 
<br>A final useEffect does a brute-force clean-up of the video stream tracks, animation frames and detection timeout when a successful symbol combination is confirmed by the user. (I was getting errors with CPU use going through the roof, so I did this to double-check everything was getting shut down right, and to check for any undisposed tensors. It may be overkill.)

- **render logic** 
<br>Ternaries and conditional rendering is used to (a) display the video feed and glowy detected symbols while detection is running (b) display a confirmation triad of symbols (the CheckResults.jsx component) at the bottom of the screen when a successful detection occurs, and (c) replace the entire display with the results of the ritual when a legitimate combination is confired by the user.
<br><br>

**CheckResults.jsx**
<br>This is a small component I broke out of the Camera component as part of a refactor that was never fully completed. It just contains the render logic for a confirmation screen displayed when a combination of 3 legitimate symbols are detected, so that the user can choose to (a) confirm the combination, (b) return to detection and try again or (c) close detection and return to the main screen.
<br><br>

**Other frontend files**
<br>There are a few other frontend files I included worth noting:

- **public/best.onnx**
<br>This is the detection model, created from Ultralytic's YOLOv8n object detection training model. It was trained on over 500 images of the 16 symbols used in the game, labelled using the CVAT annotation tool.

- **public/service-worker.js**
<br>Since the model and the files needed for the onnxruntime inference were relatively large to download to the client browser, I created a service-worker file to intercept any fetch requests to check whether they're for files that are already cached, creating a faster ready time after the first load.

- **public/app.webmanifest**
<br>The iPhone SE I was testing on has pretty modest screen real estate, so I included this web manifest file so I could save the page as a 'progressive web app' (PWA) on my home screen – which let me get rid of the large address bar that was obscuring my app.

- **index.html**
<br>Obivously this is just the index file – but I also added a loading screen in here. 
I was getting a slow upfront load time while I was testing on my phone using a Cloudflare tunnel, with a few seconds of blank screen, so I added a loading screen that would render before the main component mounted. (On the live Render site this loading time doesn't seem to be an issue, so this screen isn't really showing up.)


## Technologies used

**YOLOv8n**
<br>Ultralytic's YOLOv8n model was used for the object detection training model. It was trained on over 500 images taken of the 16 symbols used in the game.

**ONNX Runtime**
<br>The onnxruntime-web package is used to run the client-side inference for the detection model.

**TensorFlow.js**
<br>The TensorFlow.js library was essential for managing my detection model's duplicate detections and memory management. 

**CVAT**
<br>This annotation tool was used to label symbols in the 500+ images used to train the detection model.

**Cloudflare Tunnel**
<br>I used Cloudflare's Quick Tunnels to run the web app on my iPhone for testing (although once the project was finished, I used the Render platform to host the backend web service and frontend static site).

## Distinctiveness and Complexity

This project is nothing like the projects worked on earlier in the CS50W course.

The backend database did end up being static and pretty simple, although it does form a very useful scafolding that's easy to modify as I continue to test and modify the physical board game that the app is designed to accompany. (I originally started with a more dynamic database that held user game state, but in the end I realised it was simpler to just store the single piece of dymanic state – the game seed - in the client-side local storage, rather than storing it in the database.)

The project ended up being very complex (at least for a coder of my skills!), but that was primarily becuase I set out to train and use a detection model – which was nothing to do with what we studied in CS50W. 

But I think the reactive website, use of React components, use of useState, useRef and useEffect, combined with the calls to the Django backend to pull results from the database using Django query sets, all qualify as plenty of complexity to justify this as a capstone project for the CS50W course.

## AI declaration

ChatGPT was used to generate the symbols used on the ingredient cards, which the model was trained to recognise. (These will be replaced with human-created art once game development has been completed.)

Claude was used to suggest and investigate technology and resources useful for the project, including detection models, packages for running detection, apps for labelling training images, and the cloudflare tunnel used to test the web app locally on a smart phone. I also used it to help work out how to deploy my web app online on Render.

The coding work is my own... although there are plenty of chunks cribbed from tutorials, articles, Q&As on Stack Overflow and from other online resources. We stand on the shoulders of snarky giants.
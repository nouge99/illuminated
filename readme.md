# 'The Illuminated' board game app

This is a web app developed as a capstone project for CS50's Web Programming with Python and JavaScript course. 

## What is it?

It's a helper app for a board game called 'The Illuminated', a board game in which different factions of a Golden Dawn-style occult society compete to take over as their leader's health fades. 

A core element of the game is deduction. Players try to cast spells by combining different ingredients – and the aspects and effects of the ingredients change from game to game, and need to be deduced by experimentation.

## How is it used?

When players in the game want to try an ingredient combination, they arrange the three ingredients to be tested in a triangle and use the app to scan the cards. The app detects the cards played, and relays the results of the combination to the player.

Each game instance is given a random 5-letter seed, which players can share to make sure they're all playing in the same randomised game instance.

## How does the app work?

It uses a detection model (Ultralyrics's YOLOv8n model), trained on the 16 symbols used in the game, to detect the symbols on the cards played, then references a database of defined effects along with a randomised game seed to determine the outcome of the symbol combination.

## Technologies used

**YOLOv8n**
<br>Ultralytic's YOLOv8n model was used for the object detection training model.

**ONNX Runtime**
<br>The onnxruntime-web package is used to run the client-side inference for the detection model.

**CVAT**
<br>This annotation tool was used to label symbols in the 500+ images used to train the detection model.

**Cloudflare Tunnel**
<br>I used Cloudflare's Quick Tunnels to run the web app on my iPhone for the software demo. 

## AI delcaration

ChatGPT was used to generate the symbols used on the ingredient cards, which the model was trained to recognise. (These will be replaced with human-created art for a published edition of the game.)

Claude was used to suggest and investigate technology and resources useful for the project, including detection models, the ONNX Runtime apps for labelling training images, and the cloudflare tunnel used to test on iPhone.

The coding work is my own... although there are plenty of chunks cribbed from tutorials, online resources and Q&As on Stack Overflow. 


from django.shortcuts import render
from rest_framework.response import Response
from rest_framework.decorators import api_view
import random, string, os, hashlib, hmac
from dotenv import load_dotenv
from django.db.models import Count

from .models import Aspect, Element, Ritual

# Use request.session["seed"] and request.session["hashed_seed"] to store info? 

load_dotenv()
SECRET_RANDOMISER_KEY=os.environ["SECRET_RANDOMISER_KEY"].encode()

@api_view(['GET'])
def hello_world(request):
    return Response({ "message": "Hello from the backend!" })

def create_random_seed():
    seed = ''.join(random.choices(string.ascii_uppercase, k=5))
    return seed

@api_view(['GET'])
def randomise_arcana(request, seed=""):
    if not seed:
        seed = create_random_seed()

    hashed_seed = hash_seed(seed)
    rng = random.Random(hashed_seed)

    ingredients = ["eyeball", "hair", "gem", 
                   "trichobezoar", "mandrake", "flower", 
                   "skull", "hand", "mushroom", "toad", 
                   "wing", "snake"] 
    
    fragments = ["red", "green", "blue", "white", "black", "yellow"]

    elements = ["Death", "Glow", "Blood", "Knowledge", "Power", "Essence"]
    aspects =  ["Evocation", "Conjuration", 
                "Conjuration", "Summoning", 
                "Conjuration", "Summoning",
                "Summoning", "Evocation",
                "Summoning", "Evocation",
                "Evocation", "Conjuration"]

    # Each element has two ingredients that match it
    # Each element's two ingredients have different aspects, 
    #   which are set and don't vary game to game

    arcana = {}

    for element in elements:
        for _ in range(2):
            ingredient = ingredients.pop(rng.randrange(len(ingredients)))
            aspect = aspects.pop(0)
            arcana[ingredient] = {"element": element, "aspect": aspect}
        fragment = fragments.pop(rng.randrange(len(fragments)))
        arcana[fragment] = {"element": element, "aspect": "Summoning"}

    request.session["arcana"] = arcana

    return Response({ "arcana": arcana, "seed": seed })


@api_view(['POST'])
def perform_ritual(request):
    data = request.data 
    aspect_ingredient = data.get("aspect") 
    element1_ingredient = data.get("element1")
    element2_ingredient = data.get("element2")

    if not aspect_ingredient or not element1_ingredient or not element2_ingredient:
        return Response({ "ritual_result": "Error: ingredient not provided" }) 

    arcana = request.session["arcana"]
    aspect = arcana[aspect_ingredient]["aspect"]
    element1 = arcana[element1_ingredient]["element"]
    element2 = arcana[element2_ingredient]["element"]

    print(f"Ritual performed with {aspect}, {element1}, {element2}")

    successful_ritual = (
        Ritual.objects
            .filter(aspect__name=aspect, elements__name__in=[element1, element2]) # get rituals with a least one of these elements
            .annotate(num_elements=Count('elements', distinct=True)) # add extra col with count for number of distinct matching elements per ritual
            .filter(num_elements=2) # filter for the one successful ritual
    )

    element1_object = Element.objects.get(name=element1)
    opposed_element = Element.objects.get(opposed=element1_object)

    print(f"{element1_object.name} is opposed by {opposed_element.name}")

    ritual_result = ""
    effect_image = "x"
    ritual_name = ""
    instruction = ""
    fragment_colors = ["red", "green", "blue", "white", "black", "yellow"]
    fragment = random.choice(fragment_colors)
    message_alignment = "align-message-center"

    if successful_ritual.exists():
        ritual = successful_ritual.get()
        ritual_result = "Success" 
        ritual_message = ritual.message1
        ritual_name = ritual.name
        spell_element1, spell_element2 = ritual.elements.all()
        element1 = spell_element1.name
        element2 = spell_element2.name
        if ritual_name == "Fragment from Beyond":
            effect_image = f"fragment_{fragment}"
            instruction = f"Gain a {fragment} fragment"
        else:
            effect_image = ritual.effect
            instruction = ritual.outcome_message

    elif element1 == element2:
        ritual_result = "Fragment created" 
        ritual_name = "Mystical Fragment"
        ritual_message = "The ingredients combine to create a"
        potential_fragments = []        
        
        for name, data in arcana.items():
            if data["element"] == element1:
                potential_fragments.append(name)

        for name in potential_fragments:
            if name in fragment_colors:
                fragment = name
                break
        effect_image = f"fragment_{fragment}"
        element1 = element2 = "Equal"
        instruction = f"Gain a {fragment} fragment"

    elif element2 == opposed_element.name:
        ritual_result = ritual_name = "Corruption" 
        ritual_message = "The two opposed elements warp your being"
        effect_image = "corruption_draw"
        element1 = element2 = "Opposed"
        instruction = "Draw from the Corruption deck"
    else:
        ritual_result = ritual_name = "*Fizz*"
        ritual_message = "The ingredients don't react"
        message_alignment = "align-message-left"
        element1 = element2 = "Unknown"
        instruction = "• No effect\n• Ingredients are not consumed"


    print(f"Ritual name: {ritual_name}")
    print(f"Aspect: {aspect}")

    return Response({ "ritual_result": ritual_result, "ritual_message": ritual_message,  "ritual_name": ritual_name, "aspect": aspect, 
                     "element1": element1, "element2": element2, "aspect_ingredient": aspect_ingredient, 
                     "element1_ingredient": element1_ingredient, "element2_ingredient": element2_ingredient, 
                     "effect_image": effect_image, "fragment": fragment, "instruction": instruction, "message_alignment": message_alignment })

def hash_seed(seed):
    hashing = hmac.new(SECRET_RANDOMISER_KEY, seed.encode(), hashlib.md5).digest()
    hashed_seed = int.from_bytes(hashing, "big")
    return hashed_seed

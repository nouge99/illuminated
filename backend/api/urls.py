from django.urls import path
from . import views

urlpatterns = [
    path('create_random_seed/', views.create_random_seed, name="create_random_seed"),
    path('randomise_arcana/', views.randomise_arcana, name="randomise_arcana"),
    path('randomise_arcana/<str:seed>/', views.randomise_arcana, name="randomise_arcana"),
    path('perform_ritual/', views.perform_ritual, name="perform_ritual")
]


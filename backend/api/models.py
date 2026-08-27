from django.db import models

# Reminder: after updating models: 
# 'python3 manage.py makemigrations'
# 'python3 manage.py migrate'

class Aspect(models.Model):
    name = models.CharField(max_length=30, unique=True)

    def __str__(self):
        return self.name

class Element(models.Model):
    name = models.CharField(max_length=30, unique=True)
    opposed = models.ForeignKey('self', null=True, on_delete=models.SET_NULL, related_name="opposed_by")

    def __str__(self):
        opposed_name = self.opposed.name if self.opposed else "None"
        return f"{self.name} -- opposed by {opposed_name}"


class Ritual(models.Model):
    name = models.CharField(max_length=30, unique=True)
    aspect = models.ForeignKey(Aspect, on_delete=models.CASCADE, related_name="aspect_rituals")
    elements = models.ManyToManyField(Element, related_name="element_rituals")
    effect = models.CharField(max_length=30)
    message1 = models.CharField(max_length=30)
    outcome_message = models.CharField(max_length=50)

    def __str__(self):
        elements = ", ".join([element.name for element in self.elements.all()])
        return f"{self.name} -- {self.aspect} -- {elements} -- {self.effect}"
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0005_cart'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='customer_hidden',
            field=models.BooleanField(default=False),
        ),
    ]

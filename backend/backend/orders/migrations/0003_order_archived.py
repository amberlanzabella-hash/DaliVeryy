from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0002_storeconfig'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='archived',
            field=models.BooleanField(default=False),
        ),
    ]

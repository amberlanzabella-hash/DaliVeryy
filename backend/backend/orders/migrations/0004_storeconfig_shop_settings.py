from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('orders', '0003_order_archived'),
    ]

    operations = [
        migrations.AddField(
            model_name='storeconfig',
            name='business_name',
            field=models.CharField(default='AguasShop', max_length=255),
        ),
        migrations.AddField(
            model_name='storeconfig',
            name='shipping_fee',
            field=models.DecimalField(decimal_places=2, default=50, max_digits=10),
        ),
        migrations.AddField(
            model_name='storeconfig',
            name='currency',
            field=models.CharField(default='PHP', max_length=16),
        ),
        migrations.AddField(
            model_name='storeconfig',
            name='currency_symbol',
            field=models.CharField(default='\u20b1', max_length=8),
        ),
    ]

import json

from django.test import TestCase


class ProductApiTests(TestCase):
    def test_create_and_list_products(self):
        create_res = self.client.post(
            '/api/products/products/create/',
            data=json.dumps({
                'name': 'Burger',
                'price': 99.5,
                'description': 'Cheesy burger',
                'category': 'Meals',
                'image': '',
                'badge': 'New',
            }),
            content_type='application/json',
        )

        self.assertEqual(create_res.status_code, 201)
        payload = create_res.json()
        self.assertTrue(payload['ok'])
        self.assertEqual(payload['product']['name'], 'Burger')
        self.assertFalse(payload['product']['soldOut'])

        list_res = self.client.get('/api/products/products/')
        self.assertEqual(list_res.status_code, 200)
        list_payload = list_res.json()
        self.assertTrue(list_payload['ok'])
        self.assertEqual(len(list_payload['products']), 1)
        self.assertFalse(list_payload['products'][0]['soldOut'])

    def test_update_and_delete_product(self):
        create_res = self.client.post(
            '/api/products/products/create/',
            data=json.dumps({
                'name': 'Shake',
                'price': 55,
                'description': 'Cold drink',
                'category': 'Drinks',
                'image': '',
            }),
            content_type='application/json',
        )
        product_id = create_res.json()['product']['id']

        update_res = self.client.post(
            f'/api/products/products/{product_id}/update/',
            data=json.dumps({'price': 60, 'badge': 'Popular', 'soldOut': True}),
            content_type='application/json',
        )
        self.assertEqual(update_res.status_code, 200)
        updated = update_res.json()['product']
        self.assertEqual(updated['price'], 60.0)
        self.assertEqual(updated['badge'], 'Popular')
        self.assertTrue(updated['soldOut'])

        delete_res = self.client.post(f'/api/products/products/{product_id}/delete/')
        self.assertEqual(delete_res.status_code, 200)
        self.assertTrue(delete_res.json()['ok'])

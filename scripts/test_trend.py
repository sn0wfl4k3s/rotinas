import requests
import xml.etree.ElementTree as ET

url = "https://trends.google.com/trending/rss?geo=BR"
response = requests.get(url, timeout=10)
root = ET.fromstring(response.content)
ns = {'ht': 'https://trends.google.com/trending/rss'}

items = []
for item in root.findall('.//item'):
    title = item.find('title').text
    traffic_elem = item.find('ht:approx_traffic', ns)
    traffic_str = traffic_elem.text if traffic_elem is not None else '0'
    traffic = int(traffic_str.replace('+', '').replace(',', ''))
    
    news_item = item.find('ht:news_item', ns)
    news_url = news_item.find('ht:news_item_url', ns).text if news_item is not None else None
    image_url = news_item.find('ht:news_item_picture', ns).text if news_item is not None else None
    
    items.append({
        'title': title, 
        'traffic': traffic,
        'news_url': news_url,
        'image_url': image_url
    })

top = max(items, key=lambda x: x['traffic'])
print("TOP TREND:", top['title'])
print("IMAGE:", top['image_url'])
print("LINK:", top['news_url'])

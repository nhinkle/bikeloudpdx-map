import Protobuf from 'https://unpkg.com/pbf@4.0.1/index.js';
import {VectorTile} from 'https://esm.run/@mapbox/vector-tile@2.0.3/index.js';
import tileToProtobuf from 'https://esm.run/vt-pbf@3.1.3/index.js';

export const transformStreetsProtocol = 'compact_streets';

export function transformStreets(request) {
    const url = request.url.replace(transformStreetsProtocol + '://', '');
    return fetch(url)
        .then((response) => response.arrayBuffer())
        .then((data) => new VectorTile(new Protobuf(data)))
        .then((tile) => ({
            layers: Object.entries(tile.layers).reduce((acc, [layerId, layer]) => ({
                ...acc,
                [layerId]: {
                    ...layer,
                    feature: (index) => {
                        const feature = layer.feature(index);
                        if (layer.name ==='transportation_name' && feature.properties && typeof feature.properties['name'] === 'string') {
                            Object.entries(feature.properties).forEach(([k, v]) => {
                                if (typeof v === 'string' && k.startsWith('name')) {
                                    feature.properties[k] = v.replace(/^north/i, 'N').replace(/^south/i, 'S').replace(/^(N|S)?east\b/i, '$1E').replace(/^(N|S)?west\b/i, '$1W').replace(/\bAvenue\b/, 'Ave').replace(/\bStreet\b/, 'St').replace(/\bRoad\b/, 'Rd').replace(/\bBoulevard\b/, 'Blvd').replace(/\bPlace\b/, 'Pl').replace(/\bParkway\b/, 'Pkwy').replace(/\bCourt\b/, 'Ct').replace(/\bDrive\b/, 'Dr');
                                }
                            });
                        }
                        return feature;
                    }
                }
            }), {})
        }))
        .then((tile) => tileToProtobuf(tile).buffer)
        .then((data) => ({ data }));
}
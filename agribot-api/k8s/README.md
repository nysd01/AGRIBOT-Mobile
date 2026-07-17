# Kubernetes (k3s) deployment — AGRIBOT API

Deploys the API + PostgreSQL on **k3s** (lightweight Kubernetes) with **rolling updates**,
**health probes/self-healing**, **HPA autoscaling**, and **service discovery**.

## 1. Install k3s (single-node, on the VPS)
```bash
curl -sfL https://get.k3s.io | sh -
kubectl get nodes            # k3s installs kubectl + a metrics-server (needed for HPA)
```

## 2. Make the image available to k3s (build locally + import into containerd)
```bash
cd ~/AGRIBOT-Mobile/agribot-api
docker build -t agribot-api:latest .
docker save agribot-api:latest | sudo k3s ctr images import -
```

## 3. Deploy
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/api.yaml
kubectl -n agribot get pods,svc,hpa       # watch pods become Ready
```

## 4. Access
```bash
curl http://localhost:30080/health         # NodePort
# browser: http://<VPS-IP>:30080/docs   (open firewall: ufw allow 30080/tcp)
```

## 5. Demonstrate for the report (screenshots)
```bash
# Scaling (HPA):
kubectl -n agribot get hpa
kubectl -n agribot scale deployment agribot-api --replicas=4   # manual, or load-test to trigger HPA

# Rolling update (change something, rebuild+import, then):
kubectl -n agribot set image deployment/agribot-api api=agribot-api:latest
kubectl -n agribot rollout status deployment/agribot-api

# Self-healing: delete a pod, watch it recreate
kubectl -n agribot delete pod -l app=agribot-api
kubectl -n agribot get pods -w
```

## What this satisfies (rubric §7, 15 marks)
- **Containerize** → `Dockerfile`
- **Deploy with manifests** → `k8s/*.yaml`
- **Scaling** → HorizontalPodAutoscaler
- **Rolling updates** → Deployment `RollingUpdate` strategy
- **Service discovery** → API reaches DB via the `postgres` Service DNS name

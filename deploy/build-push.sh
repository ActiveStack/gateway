# !/bin/bash -x

# vars
reset=`tput sgr0`
green=`tput setaf 2`

echo 'Logging in to ECR: '
REPO="657039004102.dkr.ecr.us-west-2.amazonaws.com/activestack-gateway"
aws ecr get-login-password --region us-west-2 --profile psi | docker login --username AWS --password-stdin $REPO

# arg passed from other script
image=$1

if [ "$image" != "" ];
then
  echo "Pushing the ${green}${image}${reset} build now!"
else
  echo "${green}Enter the image name manually (branch-commit):${reset}" && read image
fi

docker tag as-gateway:${image} $REPO:${image} 
docker push $REPO:${image}

echo "Pushed ${green}${REPO}:${image}${reset} to ECR"

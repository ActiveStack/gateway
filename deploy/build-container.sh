# !/bin/bash -x

# vars
reset=`tput sgr0`
green=`tput setaf 2`

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
default_branch=`git rev-parse --abbrev-ref HEAD`;
printf "Enter branch (${green}$default_branch${reset}): "
read branch
if [ -z $branch ] 
then
  branch=$default_branch
fi
# Replace / with - because / not allowed in docker tags
branch=${branch//\//-}

default_commit=`git rev-parse --short head`
printf "Enter commit (${green}$default_commit${reset}):"
read commit
if [ -z "$commit" ] 
then
  commit=$default_commit
fi

image="${branch}-${commit}"

echo "Building ${green}as-gateway${reset} image: ${green}${image}${reset}"

docker build --build-arg VERSION_TAG=$image --target app -t as-gateway -t as-gateway:${image} .

echo "If build succeeded, ${green}${image}${reset} should be ready to push."

default_answer='yes'
printf "Do you want to push the build now? (${green}yes${reset}): "
read answer
if [ -z "$answer" ]
then
  answer=$default_answer
fi

if [ "$answer" = 'yes' ]
then
  echo "Ok, pushing..."
  sh $DIR/build-push.sh ${image}
else
  echo "Exiting script. Push later using ${green}npm run build:push${reset} & paste in branch-commit: ${green}${image}${reset}"
fi
exit
